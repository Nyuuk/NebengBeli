package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/config"
	"github.com/nyuuk/nebengbeli/internal/handler"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestHealthEndpoints(t *testing.T) {
	healthHandler := handler.NewHealthHandler(nil)
	r := gin.New()
	r.GET("/healthz", healthHandler.Healthz)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/healthz", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body["status"] != "alive" {
		t.Errorf("expected status alive, got %v", body["status"])
	}
}

func TestAuthMiddlewareRejection(t *testing.T) {
	cfg := &config.Config{
		JWTSecret: "test-secret-32-chars-long-minimum!",
		JWTExpiry: 1 * time.Hour,
	}
	jwtMgr := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)

	r := gin.New()
	r.Use(middleware.AuthMiddleware(jwtMgr, nil))
	r.GET("/api/protected", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Test 1: No token
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/protected", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401 without token, got %d", w.Code)
	}

	// Test 2: Invalid Bearer token
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/protected", nil)
	req.Header.Set("Authorization", "Bearer invalid-token-string")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401 with invalid token, got %d", w.Code)
	}
}

func TestCORSMiddlewareHeaders(t *testing.T) {
	r := gin.New()
	r.Use(middleware.CORSMiddleware([]string{"http://localhost:5173"}))
	r.GET("/api/test", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("OPTIONS", "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected status 204 for OPTIONS preflight, got %d", w.Code)
	}

	if w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Errorf("expected CORS origin header http://localhost:5173, got %s", w.Header().Get("Access-Control-Allow-Origin"))
	}
	if w.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Errorf("expected CORS allow credentials true")
	}
}

func TestRateLimiterMiddleware(t *testing.T) {
	limiter := middleware.NewRateLimiter(60, 2) // 2 burst allowed
	r := gin.New()
	r.Use(limiter.Middleware())
	r.GET("/api/ping", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	// 1st request should pass
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("GET", "/api/ping", nil)
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Errorf("expected req1 to succeed, got %d", w1.Code)
	}

	// 2nd request should pass (burst 2)
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("GET", "/api/ping", nil)
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Errorf("expected req2 to succeed, got %d", w2.Code)
	}

	// 3rd rapid request should be rate limited (429)
	w3 := httptest.NewRecorder()
	req3, _ := http.NewRequest("GET", "/api/ping", nil)
	r.ServeHTTP(w3, req3)
	if w3.Code != http.StatusTooManyRequests {
		t.Errorf("expected req3 to be rate limited (429), got %d", w3.Code)
	}
}

func TestModelConversionAndRoles(t *testing.T) {
	uid := uuid.New()
	user := &model.User{
		ID:           uid,
		Username:     "alice",
		PasswordHash: "hashed_pw",
		Role:         model.RoleUser,
		TokenVersion: 2,
		CreatedAt:    time.Now(),
	}

	resp := user.ToResponse()
	if resp.ID != uid {
		t.Errorf("expected id %s, got %s", uid, resp.ID)
	}
	if resp.Username != "alice" {
		t.Errorf("expected username alice, got %s", resp.Username)
	}

	marshaled, err := json.Marshal(user)
	if err != nil {
		t.Fatalf("failed to marshal user: %v", err)
	}
	if bytes.Contains(marshaled, []byte("hashed_pw")) {
		t.Errorf("password_hash should be omitted from json representation")
	}
	if bytes.Contains(marshaled, []byte("updated_at")) {
		t.Errorf("updated_at must NOT be present in user json")
	}
}

func TestStrictSchemaModels(t *testing.T) {
	// 1. Wallets (no updated_at)
	wallet := &model.Wallet{
		ID:        uuid.New(),
		Name:      "Buku Makan Siang",
		CreatorID: uuid.New(),
		CreatedAt: time.Now(),
	}
	wJSON, err := json.Marshal(wallet)
	if err != nil {
		t.Fatalf("failed to marshal wallet: %v", err)
	}
	if bytes.Contains(wJSON, []byte("updated_at")) {
		t.Errorf("updated_at must NOT be present in wallet json")
	}

	// 2. Entries (client_id UUID unique, item_name, note, corrects_entry_id, correction_reason, occurred_at)
	refID := uuid.New()
	entry := &model.Entry{
		ID:               uuid.New(),
		ClientID:         uuid.New(),
		WalletID:         wallet.ID,
		Type:             model.EntryTypeKoreksi,
		Amount:           -10000,
		ItemName:         "Kopi Latte",
		Note:             "Diskon member",
		CorrectsEntryID:  &refID,
		CorrectionReason: "Salah input harga",
		OccurredAt:       time.Now(),
		CreatedBy:        wallet.CreatorID,
		CreatedAt:        time.Now(),
	}
	eJSON, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("failed to marshal entry: %v", err)
	}
	if !bytes.Contains(eJSON, []byte("client_id")) {
		t.Errorf("client_id must be present in entry json")
	}
	if !bytes.Contains(eJSON, []byte("item_name")) {
		t.Errorf("item_name must be present in entry json")
	}
	if !bytes.Contains(eJSON, []byte("corrects_entry_id")) {
		t.Errorf("corrects_entry_id must be present in entry json")
	}
	if bytes.Contains(eJSON, []byte("idempotency_key")) || bytes.Contains(eJSON, []byte("correction_of_id")) {
		t.Errorf("legacy fields idempotency_key/correction_of_id must NOT be present in entry json")
	}

	// 3. Link Requests (requested_by, target_user_id, status pending/approved/rejected, decided_at, no invite/expiry)
	targetID := uuid.New()
	now := time.Now()
	linkReq := &model.LinkRequest{
		ID:           uuid.New(),
		WalletID:     wallet.ID,
		RequestedBy:  wallet.CreatorID,
		TargetUserID: targetID,
		Status:       model.LinkRequestStatusApproved,
		DecidedAt:    &now,
		CreatedAt:    now,
	}
	lJSON, err := json.Marshal(linkReq)
	if err != nil {
		t.Fatalf("failed to marshal link_request: %v", err)
	}
	if !bytes.Contains(lJSON, []byte("requested_by")) {
		t.Errorf("requested_by must be present in link_request json")
	}
	if !bytes.Contains(lJSON, []byte("target_user_id")) {
		t.Errorf("target_user_id must be present in link_request json")
	}
	if !bytes.Contains(lJSON, []byte("decided_at")) {
		t.Errorf("decided_at must be present in link_request json")
	}
	if bytes.Contains(lJSON, []byte("invite_code")) || bytes.Contains(lJSON, []byte("expires_at")) {
		t.Errorf("invite_code / expires_at must NOT be present in link_request json")
	}

	// 4. Audit Logs (actor_id, action, target_type, target_id, metadata, created_at)
	actorID := wallet.CreatorID
	targetIDStr := entry.ID.String()
	audit := &model.AuditLog{
		ID:         uuid.New(),
		ActorID:    &actorID,
		Action:     "entry.create",
		TargetType: "entry",
		TargetID:   &targetIDStr,
		Metadata:   json.RawMessage(`{"amount": 50000}`),
		CreatedAt:  now,
	}
	aJSON, err := json.Marshal(audit)
	if err != nil {
		t.Fatalf("failed to marshal audit_log: %v", err)
	}
	if !bytes.Contains(aJSON, []byte("actor_id")) {
		t.Errorf("actor_id must be present in audit_log json")
	}
	if !bytes.Contains(aJSON, []byte("target_type")) {
		t.Errorf("target_type must be present in audit_log json")
	}
	if !bytes.Contains(aJSON, []byte("target_id")) {
		t.Errorf("target_id must be present in audit_log json")
	}
	if bytes.Contains(aJSON, []byte("ip_address")) || bytes.Contains(aJSON, []byte("user_agent")) {
		t.Errorf("ip_address / user_agent must NOT be present in audit_log json")
	}
}
