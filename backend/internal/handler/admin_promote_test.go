package handler

import (
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
	"github.com/nyuuk/nebengbeli/internal/service"
)

type promotionMetadata struct{}

func (promotionMetadata) Match(value driver.Value) bool {
	b, ok := value.([]byte)
	if !ok {
		return false
	}
	var meta map[string]string
	return json.Unmarshal(b, &meta) == nil && meta["old_role"] == "user" && meta["new_role"] == "admin" && meta["target_username"] == "target" && meta["admin_id"] != ""
}

func TestAdminPromoteUser(t *testing.T) {
	for _, tc := range []struct {
		name                  string
		actorRole, targetRole model.UserRole
		status                int
	}{
		{"success and audit", model.RoleAdmin, model.RoleUser, http.StatusOK},
		{"already admin", model.RoleAdmin, model.RoleAdmin, http.StatusConflict},
		{"not found", model.RoleAdmin, "", http.StatusNotFound},
		{"non-admin", model.RoleUser, model.RoleUser, http.StatusForbidden},
		{"invalid id", model.RoleAdmin, model.RoleUser, http.StatusBadRequest},
		{"database failure", model.RoleAdmin, model.RoleUser, http.StatusInternalServerError},
		{"concurrent promotion", model.RoleAdmin, model.RoleUser, http.StatusConflict},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			actorID, targetID := uuid.New(), uuid.New()
			now := time.Now()
			userRows := func(id uuid.UUID, name string, role model.UserRole) *sqlmock.Rows {
				return sqlmock.NewRows([]string{"id", "username", "password_hash", "role", "token_version", "created_at"}).AddRow(id, name, "hash", role, 1, now)
			}
			// Even a token with stale role=user must use the current DB role.
			jwtMgr := auth.NewJWTManager("test-only-secret", time.Hour)
			token, err := jwtMgr.GenerateToken(&model.User{ID: actorID, Username: "actor", Role: model.RoleUser, TokenVersion: 1})
			if err != nil {
				t.Fatal(err)
			}
			mock.ExpectQuery("SELECT id, username, password_hash, role, token_version, created_at").WithArgs(actorID).WillReturnRows(userRows(actorID, "actor", tc.actorRole))
			if tc.actorRole == model.RoleAdmin && tc.name != "invalid id" {
				q := mock.ExpectQuery("SELECT id, username, password_hash, role, token_version, created_at").WithArgs(targetID)
				if tc.name == "not found" {
					q.WillReturnError(sql.ErrNoRows)
				} else {
					q.WillReturnRows(userRows(targetID, "target", tc.targetRole))
				}
				if tc.targetRole == model.RoleUser {
					update := mock.ExpectExec("UPDATE users SET role").WithArgs(model.RoleAdmin, targetID, model.RoleUser)
					switch tc.name {
					case "database failure":
						update.WillReturnError(errors.New("database unavailable"))
					case "concurrent promotion":
						update.WillReturnResult(sqlmock.NewResult(0, 0))
					default:
						update.WillReturnResult(sqlmock.NewResult(0, 1))
						mock.ExpectQuery("INSERT INTO audit_logs").WithArgs(actorID, "user_promote_admin", "user", targetID.String(), promotionMetadata{}, sqlmock.AnyArg()).WillReturnRows(sqlmock.NewRows([]string{"id", "created_at"}).AddRow(uuid.New(), now))
					}
				}
			}
			svc := service.NewAuthService(repository.NewUserRepository(db), repository.NewAuditRepository(db), jwtMgr)
			h := NewAdminHandler(nil, nil, nil, nil, svc)
			gin.SetMode(gin.TestMode)
			router := gin.New()
			group := router.Group("/api/admin", middleware.AuthMiddleware(jwtMgr, svc), middleware.RequireRole(model.RoleAdmin))
			group.POST("/users/:id/promote", h.PromoteUser)
			id := targetID.String()
			if tc.name == "invalid id" {
				id = "bad-id"
			}
			req := httptest.NewRequest(http.MethodPost, "/api/admin/users/"+id+"/promote", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			res := httptest.NewRecorder()
			router.ServeHTTP(res, req)
			if res.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", res.Code, tc.status, res.Body.String())
			}
			if tc.status == http.StatusOK {
				var response struct {
					Message string             `json:"message"`
					User    model.UserResponse `json:"user"`
				}
				if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
					t.Fatalf("decode response: %v", err)
				}
				if response.Message != "user promoted to admin successfully" || response.User.ID != targetID || response.User.Username != "target" || response.User.Role != model.RoleAdmin {
					t.Fatalf("unexpected response: %s", res.Body.String())
				}
				// Internal authentication fields are intentionally excluded from UserResponse.
				var payload struct {
					User map[string]json.RawMessage `json:"user"`
				}
				if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
					t.Fatal(err)
				}
				for _, field := range []string{"token_version", "password_hash"} {
					if _, exposed := payload.User[field]; exposed {
						t.Errorf("response exposes internal field %q", field)
					}
				}
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
