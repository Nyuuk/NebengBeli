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

// Predefined fixture constants
const (
	FixtureCreatorUsername = "test_creator"
	FixtureOwnerUsername   = "test_owner"
	FixtureAdminUsername   = "test_admin"
)

type DevSeedRequest struct {
	Scenario string `json:"scenario"` // "empty", "standard", "linked"
}

func (h *DevHandler) isDevAllowed() bool {
	if h.cfg == nil || !h.cfg.EnableDevEndpoints {
		return false
	}
	env := h.cfg.Environment
	return env == "development" || env == "local" || env == "dev"
}

// Status returns dev handler status
func (h *DevHandler) Status(c *gin.Context) {
	if !h.isDevAllowed() {
		c.JSON(http.StatusForbidden, gin.H{"error": "developer endpoints are strictly disabled in this environment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"enabled":     h.cfg.EnableDevEndpoints,
		"environment": h.cfg.Environment,
		"message":     "Dev fixture endpoints active (local/dev only; passwordless session issuance is strictly disabled)",
	})
}

// CreateSession is strictly disabled fail-closed: no password-free endpoint may issue authenticated sessions to any caller
func (h *DevHandler) CreateSession(c *gin.Context) {
	if !h.isDevAllowed() {
		c.JSON(http.StatusForbidden, gin.H{"error": "developer endpoints are strictly disabled in this environment"})
		return
	}

	c.JSON(http.StatusForbidden, gin.H{
		"error": "passwordless session issuance is strictly disabled: authenticated sessions cannot be issued without valid credentials",
	})
}

// ResetFixtures wipes data from tables safely in dev context
func (h *DevHandler) ResetFixtures(c *gin.Context) {
	if !h.isDevAllowed() {
		c.JSON(http.StatusForbidden, gin.H{"error": "developer endpoints are strictly disabled in this environment"})
		return
	}

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
	if !h.isDevAllowed() {
		c.JSON(http.StatusForbidden, gin.H{"error": "developer endpoints are strictly disabled in this environment"})
		return
	}

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
