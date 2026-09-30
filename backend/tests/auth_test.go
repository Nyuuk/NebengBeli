package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/config"
	"github.com/nyuuk/nebengbeli/internal/handler"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/service"
)

func TestPasswordHashing(t *testing.T) {
	raw := "securePassword123"
	hash, err := auth.HashPassword(raw)
	if err != nil {
		t.Fatalf("unexpected error hashing password: %v", err)
	}

	if hash == raw {
		t.Errorf("hash should not match raw password directly")
	}

	if !auth.CheckPassword(raw, hash) {
		t.Errorf("password verification failed for matching password")
	}

	if auth.CheckPassword("wrongPassword", hash) {
		t.Errorf("password verification succeeded for wrong password")
	}
}

func TestJWTIssuanceAndValidation(t *testing.T) {
	secret := "test-secret-key-32-characters-minimum"
	mgr := auth.NewJWTManager(secret, 1*time.Hour)

	user := &model.User{
		ID:           uuid.New(),
		Username:     "tester",
		Role:         model.RoleUser,
		TokenVersion: 1,
	}

	token, err := mgr.GenerateToken(user)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	claims, err := mgr.ValidateToken(token)
	if err != nil {
		t.Fatalf("failed to validate valid token: %v", err)
	}

	if claims.UserID != user.ID {
		t.Errorf("expected userID %s, got %s", user.ID, claims.UserID)
	}
	if claims.Username != user.Username {
		t.Errorf("expected username %s, got %s", user.Username, claims.Username)
	}
	if claims.TokenVersion != user.TokenVersion {
		t.Errorf("expected tokenVersion %d, got %d", user.TokenVersion, claims.TokenVersion)
	}
}

func TestJWTExpired(t *testing.T) {
	secret := "test-secret-key-32-characters-minimum"
	mgr := auth.NewJWTManager(secret, -1*time.Minute) // already expired

	user := &model.User{
		ID:           uuid.New(),
		Username:     "expired_user",
		Role:         model.RoleUser,
		TokenVersion: 1,
	}

	token, err := mgr.GenerateToken(user)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	_, err = mgr.ValidateToken(token)
	if err == nil {
		t.Errorf("expected error validating expired token, got nil")
	}
}

func TestConfigCookieSecureEnvironmentDefaults(t *testing.T) {
	origCookieSecure := os.Getenv("COOKIE_SECURE")
	origEnv := os.Getenv("ENVIRONMENT")
	t.Cleanup(func() {
		if origCookieSecure != "" {
			os.Setenv("COOKIE_SECURE", origCookieSecure)
		} else {
			os.Unsetenv("COOKIE_SECURE")
		}
		if origEnv != "" {
			os.Setenv("ENVIRONMENT", origEnv)
		} else {
			os.Unsetenv("ENVIRONMENT")
		}
	})

	// Scenario 1: Explicit COOKIE_SECURE=false (e.g. local E2E setup / development HTTP)
	os.Setenv("COOKIE_SECURE", "false")
	os.Setenv("ENVIRONMENT", "development")
	cfg := config.LoadConfig()
	if cfg.CookieSecure {
		t.Errorf("expected CookieSecure to be false when COOKIE_SECURE=false, got true")
	}

	// Scenario 2: Explicit COOKIE_SECURE=true
	os.Setenv("COOKIE_SECURE", "true")
	os.Setenv("ENVIRONMENT", "development")
	cfg = config.LoadConfig()
	if !cfg.CookieSecure {
		t.Errorf("expected CookieSecure to be true when COOKIE_SECURE=true, got false")
	}

	// Scenario 3: Explicit COOKIE_SECURE=1
	os.Setenv("COOKIE_SECURE", "1")
	cfg = config.LoadConfig()
	if !cfg.CookieSecure {
		t.Errorf("expected CookieSecure to be true when COOKIE_SECURE=1, got false")
	}

	// Scenario 4: Explicit COOKIE_SECURE=0
	os.Setenv("COOKIE_SECURE", "0")
	cfg = config.LoadConfig()
	if cfg.CookieSecure {
		t.Errorf("expected CookieSecure to be false when COOKIE_SECURE=0, got true")
	}

	// Scenario 5: Unset COOKIE_SECURE in production -> secure by default (fail-secure)
	os.Unsetenv("COOKIE_SECURE")
	os.Setenv("ENVIRONMENT", "production")
	cfg = config.LoadConfig()
	if !cfg.CookieSecure {
		t.Errorf("expected CookieSecure to default to true in production, got false")
	}

	// Scenario 6: Unset COOKIE_SECURE in development -> insecure by default for local HTTP
	os.Unsetenv("COOKIE_SECURE")
	os.Setenv("ENVIRONMENT", "development")
	cfg = config.LoadConfig()
	if cfg.CookieSecure {
		t.Errorf("expected CookieSecure to default to false in development, got true")
	}
}

func TestLocalHTTPAuthCookieAndListLinks(t *testing.T) {
	jwtSecret := "test-secret-32-chars-long-minimum!"
	jwtMgr := auth.NewJWTManager(jwtSecret, 72*time.Hour)

	userRepo := &mockUserRepo{
		users:     make(map[string]*model.User),
		usersByID: make(map[uuid.UUID]*model.User),
	}
	auditRepo := &mockAuditRepo{}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	linkRepo := &mockLinkRepo{reqs: make(map[uuid.UUID]*model.LinkRequest)}

	authSvc := service.NewAuthService(userRepo, auditRepo, jwtMgr)
	linkSvc := service.NewLinkService(linkRepo, walletRepo, userRepo, auditRepo)

	// 1. Local HTTP development configuration (CookieSecure: false)
	localCfg := &config.Config{
		JWTSecret:    jwtSecret,
		JWTExpiry:    72 * time.Hour,
		Environment:  "development",
		CookieSecure: false,
	}

	authHandler := handler.NewAuthHandler(authSvc, localCfg)
	linkHandler := handler.NewLinkRequestHandler(linkSvc)

	r := gin.New()
	api := r.Group("/api")
	{
		api.POST("/auth/login", authHandler.Login)
		api.POST("/auth/register", authHandler.Register)

		authRequired := api.Group("")
		authRequired.Use(middleware.AuthMiddleware(jwtMgr, authSvc))
		{
			authRequired.GET("/links", linkHandler.List)
		}
	}

	// Register a test user
	registeredUser, _, _, err := authSvc.Register(context.Background(), "fixture_creator", "password123")
	if err != nil {
		t.Fatalf("failed to register fixture user: %v", err)
	}

	// Target user for link request
	targetUser, _, _, err := authSvc.Register(context.Background(), "fixture_target", "password123")
	if err != nil {
		t.Fatalf("failed to register target user: %v", err)
	}

	// Seed a link request involving fixture_creator
	walletID := uuid.New()
	linkReq := &model.LinkRequest{
		ID:           uuid.New(),
		WalletID:     walletID,
		RequestedBy:  registeredUser.ID,
		TargetUserID: targetUser.ID,
		Status:       model.LinkRequestStatusPending,
		CreatedAt:    time.Now(),
	}
	_ = linkRepo.Create(context.Background(), linkReq)

	// Step A: Login over local HTTP endpoint
	loginPayload, _ := json.Marshal(map[string]string{
		"username": "fixture_creator",
		"password": "password123",
	})
	wLogin := httptest.NewRecorder()
	reqLogin, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(loginPayload))
	reqLogin.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(wLogin, reqLogin)

	if wLogin.Code != http.StatusOK {
		t.Fatalf("login failed: code %d, body: %s", wLogin.Code, wLogin.Body.String())
	}

	// Step B: Verify Set-Cookie header does NOT have Secure flag for local HTTP
	setCookieHdr := wLogin.Header().Get("Set-Cookie")
	if setCookieHdr == "" {
		t.Fatalf("expected Set-Cookie header on successful login, got none")
	}
	if !strings.Contains(setCookieHdr, middleware.CookieTokenKey+"=") {
		t.Errorf("expected Set-Cookie to contain %s, got: %s", middleware.CookieTokenKey, setCookieHdr)
	}
	if !strings.Contains(setCookieHdr, "HttpOnly") {
		t.Errorf("expected HttpOnly flag in Set-Cookie, got: %s", setCookieHdr)
	}
	if strings.Contains(setCookieHdr, "Secure") {
		t.Errorf("expected NO Secure flag on local HTTP cookie, got: %s", setCookieHdr)
	}

	// Extract the cookie
	cookies := wLogin.Result().Cookies()
	var authCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == middleware.CookieTokenKey {
			authCookie = c
			break
		}
	}
	if authCookie == nil {
		t.Fatalf("failed to parse %s cookie from login response", middleware.CookieTokenKey)
	}

	// Step C: Native browser GET /api/links with cookie over HTTP (no Authorization header)
	wLinks := httptest.NewRecorder()
	reqLinks, _ := http.NewRequest("GET", "/api/links", nil)
	reqLinks.AddCookie(authCookie)
	r.ServeHTTP(wLinks, reqLinks)

	if wLinks.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for GET /api/links with HTTP auth cookie, got %d: %s", wLinks.Code, wLinks.Body.String())
	}

	var linksResp struct {
		LinkRequests []model.LinkRequest `json:"link_requests"`
	}
	if err := json.Unmarshal(wLinks.Body.Bytes(), &linksResp); err != nil {
		t.Fatalf("failed to decode /api/links response: %v", err)
	}

	if len(linksResp.LinkRequests) != 1 {
		t.Fatalf("expected 1 link request, got %d", len(linksResp.LinkRequests))
	}
	if linksResp.LinkRequests[0].ID != linkReq.ID {
		t.Errorf("expected link request id %s, got %s", linkReq.ID, linksResp.LinkRequests[0].ID)
	}

	// Step D: Verify HTTPS / Production configuration preserves Secure flag
	prodCfg := &config.Config{
		JWTSecret:    jwtSecret,
		JWTExpiry:    72 * time.Hour,
		Environment:  "production",
		CookieSecure: true,
	}
	prodAuthHandler := handler.NewAuthHandler(authSvc, prodCfg)
	prodRouter := gin.New()
	prodRouter.POST("/api/auth/login", prodAuthHandler.Login)

	wProd := httptest.NewRecorder()
	reqProd, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(loginPayload))
	reqProd.Header.Set("Content-Type", "application/json")
	prodRouter.ServeHTTP(wProd, reqProd)

	if wProd.Code != http.StatusOK {
		t.Fatalf("prod login failed: %d", wProd.Code)
	}
	prodCookieHdr := wProd.Header().Get("Set-Cookie")
	if !strings.Contains(prodCookieHdr, "Secure") {
		t.Errorf("expected Secure attribute in production Set-Cookie header, got: %s", prodCookieHdr)
	}

	// Step E: Ensure token validation integrity is maintained (not weakened)
	// E1. No cookie and no Authorization header -> 401
	wNoAuth := httptest.NewRecorder()
	reqNoAuth, _ := http.NewRequest("GET", "/api/links", nil)
	r.ServeHTTP(wNoAuth, reqNoAuth)
	if wNoAuth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 when no auth provided, got %d", wNoAuth.Code)
	}

	// E2. Tampered / invalid token in cookie -> 401
	wInvalid := httptest.NewRecorder()
	reqInvalid, _ := http.NewRequest("GET", "/api/links", nil)
	reqInvalid.AddCookie(&http.Cookie{Name: middleware.CookieTokenKey, Value: "invalid.jwt.token"})
	r.ServeHTTP(wInvalid, reqInvalid)
	if wInvalid.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for tampered cookie token, got %d", wInvalid.Code)
	}

	// E3. Expired token in cookie -> 401
	expiredJwtMgr := auth.NewJWTManager(jwtSecret, -1*time.Minute)
	userModel, _ := userRepo.GetByID(context.Background(), registeredUser.ID)
	expiredToken, _ := expiredJwtMgr.GenerateToken(userModel)
	wExpired := httptest.NewRecorder()
	reqExpired, _ := http.NewRequest("GET", "/api/links", nil)
	reqExpired.AddCookie(&http.Cookie{Name: middleware.CookieTokenKey, Value: expiredToken})
	r.ServeHTTP(wExpired, reqExpired)
	if wExpired.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for expired cookie token, got %d", wExpired.Code)
	}
}
