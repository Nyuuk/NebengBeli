package handler

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/config"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
)

type DevHandler struct {
	db         *sql.DB
	userRepo   repository.UserRepository
	walletRepo repository.WalletRepository
	entryRepo  repository.EntryRepository
	linkRepo   repository.LinkRequestRepository
	auditRepo  repository.AuditRepository
	jwtMgr     *auth.JWTManager
	cfg        *config.Config
}

func NewDevHandler(
	db *sql.DB,
	userRepo repository.UserRepository,
	walletRepo repository.WalletRepository,
	entryRepo repository.EntryRepository,
	linkRepo repository.LinkRequestRepository,
	auditRepo repository.AuditRepository,
	jwtMgr *auth.JWTManager,
	cfg *config.Config,
) *DevHandler {
	return &DevHandler{
		db:         db,
		userRepo:   userRepo,
		walletRepo: walletRepo,
		entryRepo:  entryRepo,
		linkRepo:   linkRepo,
		auditRepo:  auditRepo,
		jwtMgr:     jwtMgr,
		cfg:        cfg,
	}
}

type DevSessionRequest struct {
	Username string `json:"username" binding:"required,min=2,max=64"`
	Role     string `json:"role"`
}

type DevSeedRequest struct {
	Scenario string `json:"scenario"` // "empty", "standard", "linked"
}

// Status returns dev handler status
func (h *DevHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"enabled":     h.cfg.EnableDevEndpoints,
		"environment": h.cfg.Environment,
		"message":     "Dev fixtures and session endpoints active (local/dev only)",
	})
}

// CreateSession generates an authenticated session token & cookie without requiring credentials
func (h *DevHandler) CreateSession(c *gin.Context) {
	var req DevSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := model.RoleUser
	if req.Role == string(model.RoleAdmin) {
		role = model.RoleAdmin
	}

	ctx := c.Request.Context()
	user, err := h.userRepo.GetByUsername(ctx, req.Username)
	if err != nil {
		// User does not exist, create with a secure random internal password hash
		randomBytes := make([]byte, 16)
		_, _ = rand.Read(randomBytes)
		randomSecret := hex.EncodeToString(randomBytes)
		hash, hashErr := auth.HashPassword(randomSecret)
		if hashErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate internal password hash"})
			return
		}

		user = &model.User{
			Username:     req.Username,
			PasswordHash: hash,
			Role:         role,
			TokenVersion: 1,
		}

		if err := h.userRepo.Create(ctx, user); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create dev test user: " + err.Error()})
			return
		}
	} else if user.Role != role {
		// Update role if explicitly requested
		query := `UPDATE users SET role = $1 WHERE id = $2`
		_, _ = h.db.ExecContext(ctx, query, role, user.ID)
		user.Role = role
	}

	token, err := h.jwtMgr.GenerateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token: " + err.Error()})
		return
	}

	// Set auth cookie
	maxAge := int(h.cfg.JWTExpiry.Seconds())
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		middleware.CookieTokenKey,
		token,
		maxAge,
		"/",
		h.cfg.CookieDomain,
		h.cfg.CookieSecure,
		true, // HttpOnly
	)

	c.JSON(http.StatusOK, gin.H{
		"user":  user.ToResponse(),
		"token": token,
	})
}

// ResetFixtures wipes data from tables safely in dev context
func (h *DevHandler) ResetFixtures(c *gin.Context) {
	ctx := c.Request.Context()

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction: " + err.Error()})
		return
	}
	defer tx.Rollback()

	queries := []string{
		"DELETE FROM entries;",
		"DELETE FROM link_requests;",
		"DELETE FROM wallets;",
		"DELETE FROM audit_logs;",
		"DELETE FROM users;",
	}

	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed executing " + q + ": " + err.Error()})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit reset: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "all test fixture data reset successfully"})
}

// SeedFixtures seeds predictable local test data for automated tests
func (h *DevHandler) SeedFixtures(c *gin.Context) {
	var req DevSeedRequest
	_ = c.ShouldBindJSON(&req)
	scenario := req.Scenario
	if scenario == "" {
		scenario = "standard"
	}

	ctx := c.Request.Context()

	// 1. Create standard test accounts
	createUser := func(username string, role model.UserRole) (*model.User, error) {
		u, err := h.userRepo.GetByUsername(ctx, username)
		if err == nil && u != nil {
			return u, nil
		}
		randomBytes := make([]byte, 16)
		_, _ = rand.Read(randomBytes)
		hash, _ := auth.HashPassword(hex.EncodeToString(randomBytes))
		user := &model.User{
			Username:     username,
			PasswordHash: hash,
			Role:         role,
			TokenVersion: 1,
		}
		if err := h.userRepo.Create(ctx, user); err != nil {
			return nil, err
		}
		return user, nil
	}

	creator, err := createUser("test_creator", model.RoleUser)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed creating test_creator: " + err.Error()})
		return
	}

	owner, err := createUser("test_owner", model.RoleUser)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed creating test_owner: " + err.Error()})
		return
	}

	admin, err := createUser("test_admin", model.RoleAdmin)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed creating test_admin: " + err.Error()})
		return
	}

	resp := gin.H{
		"scenario": scenario,
		"users": gin.H{
			"creator": creator.Username,
			"owner":   owner.Username,
			"admin":   admin.Username,
		},
	}

	if scenario == "standard" || scenario == "wallet_with_entries" || scenario == "linked" {
		wallet := &model.Wallet{
			Name:      "Buku Makan Siang",
			CreatorID: creator.ID,
		}
		if err := h.walletRepo.Create(ctx, wallet); err == nil {
			resp["wallet_id"] = wallet.ID

			if scenario == "standard" || scenario == "wallet_with_entries" {
				// Seed entries
				entry1 := &model.Entry{
					ClientID:   uuid.New(),
					WalletID:   wallet.ID,
					Type:       model.EntryTypeTitipan,
					Amount:     50000,
					ItemName:   "Nasi Padang",
					Note:       "Makan siang bersama",
					OccurredAt: time.Now().Add(-2 * time.Hour),
					CreatedBy:  creator.ID,
				}
				_, _, _ = h.entryRepo.Create(ctx, entry1)

				entry2 := &model.Entry{
					ClientID:   uuid.New(),
					WalletID:   wallet.ID,
					Type:       model.EntryTypeTopup,
					Amount:     -50000,
					ItemName:   "Transfer Pelunasan",
					Note:       "BCA",
					OccurredAt: time.Now().Add(-1 * time.Hour),
					CreatedBy:  creator.ID,
				}
				_, _, _ = h.entryRepo.Create(ctx, entry2)
			}

			if scenario == "linked" {
				_ = h.walletRepo.SetOwner(ctx, wallet.ID, owner.ID)
			}
		}
	}

	c.JSON(http.StatusOK, resp)
}
