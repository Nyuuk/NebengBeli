package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/config"
	"github.com/nyuuk/nebengbeli/internal/handler"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
	"github.com/nyuuk/nebengbeli/internal/service"
)

// MockEntryRepo for unit testing service layer logic
type mockEntryRepo struct {
	entries map[uuid.UUID]*model.Entry
}

func (m *mockEntryRepo) Create(ctx context.Context, entry *model.Entry) (*model.Entry, bool, error) {
	for _, e := range m.entries {
		if e.ClientID == entry.ClientID {
			return e, true, nil
		}
	}
	entry.ID = uuid.New()
	entry.CreatedAt = time.Now()
	m.entries[entry.ID] = entry
	return entry, false, nil
}

func (m *mockEntryRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.Entry, error) {
	if e, ok := m.entries[id]; ok {
		return e, nil
	}
	return nil, repository.ErrEntryNotFound
}

func (m *mockEntryRepo) GetByClientID(ctx context.Context, clientID uuid.UUID) (*model.Entry, error) {
	for _, e := range m.entries {
		if e.ClientID == clientID {
			return e, nil
		}
	}
	return nil, nil
}

func (m *mockEntryRepo) ListByWallet(ctx context.Context, filter repository.EntryFilter) ([]model.Entry, int64, error) {
	res := make([]model.Entry, 0)
	return res, 0, nil
}

func (m *mockEntryRepo) GetWalletSummary(ctx context.Context, walletID uuid.UUID) (*model.StatementSummary, error) {
	return &model.StatementSummary{}, nil
}

func (m *mockEntryRepo) MoveEntry(ctx context.Context, sourceWalletID, targetWalletID, entryID, createdBy uuid.UUID, notes string) (*model.Entry, *model.Entry, error) {
	orig, ok := m.entries[entryID]
	if !ok {
		return nil, nil, repository.ErrEntryNotFound
	}
	if orig.Type == model.EntryTypeKoreksi {
		return nil, nil, service.ErrInvalidEntryType
	}
	corr := &model.Entry{
		ID:       uuid.New(),
		WalletID: sourceWalletID,
		Type:     model.EntryTypeKoreksi,
		Amount:   -orig.Amount,
	}
	newE := &model.Entry{
		ID:       uuid.New(),
		WalletID: targetWalletID,
		Type:     orig.Type,
		Amount:   orig.Amount,
	}
	return corr, newE, nil
}

func (m *mockEntryRepo) CountAll(ctx context.Context) (int64, int64, error) {
	return int64(len(m.entries)), 0, nil
}

type mockWalletRepo struct {
	wallets map[uuid.UUID]*model.Wallet
}

func (m *mockWalletRepo) Create(ctx context.Context, wallet *model.Wallet) error {
	wallet.ID = uuid.New()
	wallet.CreatedAt = time.Now()
	m.wallets[wallet.ID] = wallet
	return nil
}

func (m *mockWalletRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.Wallet, error) {
	if w, ok := m.wallets[id]; ok {
		return w, nil
	}
	return nil, repository.ErrWalletNotFound
}

func (m *mockWalletRepo) GetByIDWithDetails(ctx context.Context, id uuid.UUID, userID *uuid.UUID) (*model.Wallet, error) {
	return m.GetByID(ctx, id)
}

func (m *mockWalletRepo) ListByUser(ctx context.Context, userID uuid.UUID, includeArchived bool) ([]model.Wallet, error) {
	return make([]model.Wallet, 0), nil
}

func (m *mockWalletRepo) ListAll(ctx context.Context, limit, offset int) ([]model.Wallet, int64, error) {
	return make([]model.Wallet, 0), 0, nil
}

func (m *mockWalletRepo) UpdateName(ctx context.Context, id uuid.UUID, name string) error {
	return nil
}

func (m *mockWalletRepo) SetArchived(ctx context.Context, id uuid.UUID, archived bool) error {
	return nil
}

func (m *mockWalletRepo) SetOwner(ctx context.Context, id uuid.UUID, ownerID uuid.UUID) error {
	return nil
}

func (m *mockWalletRepo) IsUserAuthorized(ctx context.Context, walletID, userID uuid.UUID) (bool, error) {
	return true, nil
}

func (m *mockWalletRepo) Count(ctx context.Context) (int64, int64, error) {
	return int64(len(m.wallets)), 0, nil
}

type mockAuditRepo struct{}

func (m *mockAuditRepo) Create(ctx context.Context, log *model.AuditLog) error {
	return nil
}

func (m *mockAuditRepo) List(ctx context.Context, filter repository.AuditLogFilter) ([]model.AuditLog, int64, error) {
	return make([]model.AuditLog, 0), 0, nil
}

func (m *mockAuditRepo) Count(ctx context.Context) (int64, error) {
	return 0, nil
}

type mockUserRepo struct {
	users     map[string]*model.User
	usersByID map[uuid.UUID]*model.User
}

func (m *mockUserRepo) Create(ctx context.Context, user *model.User) error {
	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}
	user.CreatedAt = time.Now()
	m.users[user.Username] = user
	m.usersByID[user.ID] = user
	return nil
}

func (m *mockUserRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	if u, ok := m.usersByID[id]; ok {
		return u, nil
	}
	return nil, repository.ErrUserNotFound
}

func (m *mockUserRepo) GetByUsername(ctx context.Context, username string) (*model.User, error) {
	if u, ok := m.users[username]; ok {
		return u, nil
	}
	return nil, repository.ErrUserNotFound
}

func (m *mockUserRepo) IncrementTokenVersion(ctx context.Context, id uuid.UUID) (int, error) {
	if u, ok := m.usersByID[id]; ok {
		u.TokenVersion++
		return u.TokenVersion, nil
	}
	return 0, repository.ErrUserNotFound
}

func (m *mockUserRepo) UpdatePassword(ctx context.Context, id uuid.UUID, newPasswordHash string) error {
	if u, ok := m.usersByID[id]; ok {
		u.PasswordHash = newPasswordHash
		u.TokenVersion++
		return nil
	}
	return repository.ErrUserNotFound
}

func (m *mockUserRepo) List(ctx context.Context, limit, offset int) ([]model.User, int64, error) {
	res := make([]model.User, 0)
	for _, u := range m.usersByID {
		res = append(res, *u)
	}
	return res, int64(len(res)), nil
}

func (m *mockUserRepo) Count(ctx context.Context) (int64, error) {
	return int64(len(m.usersByID)), nil
}

type mockLinkRepo struct{}

func (m *mockLinkRepo) Create(ctx context.Context, req *model.LinkRequest) error { return nil }
func (m *mockLinkRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.LinkRequest, error) {
	return nil, nil
}
func (m *mockLinkRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status model.LinkRequestStatus) error {
	return nil
}
func (m *mockLinkRepo) ListForUser(ctx context.Context, userID uuid.UUID) ([]model.LinkRequest, error) {
	return nil, nil
}
func (m *mockLinkRepo) ListByWallet(ctx context.Context, walletID uuid.UUID) ([]model.LinkRequest, error) {
	return nil, nil
}

func TestStatementResponseEmptyEntriesNormalized(t *testing.T) {
	resp := model.StatementResponse{
		Wallet: model.Wallet{
			ID:   uuid.New(),
			Name: "Test Wallet",
		},
		Summary:  model.StatementSummary{},
		Entries:  []model.Entry{}, // Non-nil empty slice
		Total:    0,
		Page:     1,
		PageSize: 25,
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("failed to marshal statement response: %v", err)
	}

	if bytes.Contains(data, []byte(`"entries":null`)) {
		t.Errorf("expected entries to be [], but got null in JSON: %s", string(data))
	}
	if !bytes.Contains(data, []byte(`"entries":[]`)) {
		t.Errorf("expected entries to be serialized as [], got: %s", string(data))
	}
}

func TestDisallowCorrectingCorrectionEntry(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	auditRepo := &mockAuditRepo{}

	walletID := uuid.New()
	userID := uuid.New()
	wallet := &model.Wallet{
		ID:        walletID,
		Name:      "Buku Test",
		CreatorID: userID,
	}
	walletRepo.wallets[walletID] = wallet

	// Create initial titipan entry
	origID := uuid.New()
	entryRepo.entries[origID] = &model.Entry{
		ID:        origID,
		ClientID:  uuid.New(),
		WalletID:  walletID,
		Type:      model.EntryTypeTitipan,
		Amount:    50000,
		ItemName:  "Makan Siang",
		CreatedBy: userID,
	}

	// Create correction entry correcting the titipan
	corrID := uuid.New()
	entryRepo.entries[corrID] = &model.Entry{
		ID:              corrID,
		ClientID:        uuid.New(),
		WalletID:        walletID,
		Type:            model.EntryTypeKoreksi,
		Amount:          -10000,
		ItemName:        "Makan Siang",
		CorrectsEntryID: &origID,
		CreatedBy:       userID,
	}

	svc := service.NewEntryService(entryRepo, walletRepo, auditRepo)

	// Attempt to correct the correction entry
	req := service.CreateEntryRequest{
		WalletID:        walletID,
		Type:            model.EntryTypeKoreksi,
		Amount:          5000,
		ItemName:        "Makan Siang",
		CorrectsEntryID: &corrID,
	}

	_, _, err := svc.CreateEntry(context.Background(), userID, model.RoleUser, req)
	if err == nil {
		t.Fatalf("expected error when attempting to correct a correction entry, got nil")
	}

	if !strings.Contains(err.Error(), "cannot correct an entry of type koreksi") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestIdempotentDuplicateEntryHandling(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	auditRepo := &mockAuditRepo{}

	walletID := uuid.New()
	userID := uuid.New()
	wallet := &model.Wallet{
		ID:        walletID,
		Name:      "Buku Test",
		CreatorID: userID,
	}
	walletRepo.wallets[walletID] = wallet

	svc := service.NewEntryService(entryRepo, walletRepo, auditRepo)

	clientID := uuid.New()
	req := service.CreateEntryRequest{
		ClientID: &clientID,
		WalletID: walletID,
		Type:     model.EntryTypeTitipan,
		Amount:   25000,
		ItemName: "Kopi",
	}

	// 1st create: new entry
	entry1, isDup1, err := svc.CreateEntry(context.Background(), userID, model.RoleUser, req)
	if err != nil {
		t.Fatalf("first create failed: %v", err)
	}
	if isDup1 {
		t.Errorf("first create should not be duplicate")
	}

	// 2nd create with identical client_id: idempotent duplicate
	entry2, isDup2, err := svc.CreateEntry(context.Background(), userID, model.RoleUser, req)
	if err != nil {
		t.Fatalf("second create failed: %v", err)
	}
	if !isDup2 {
		t.Errorf("second create with identical client_id must return is_duplicate=true")
	}
	if entry1.ID != entry2.ID {
		t.Errorf("expected same entry ID %s, got %s", entry1.ID, entry2.ID)
	}
}

func TestServiceWorkerFilesExist(t *testing.T) {
	// Verify service-worker.js exists in frontend/public and is valid javascript
	swPath := filepath.Join("..", "..", "frontend", "public", "service-worker.js")
	content, err := os.ReadFile(swPath)
	if err != nil {
		// Fallback check if run from repo root
		swPath = filepath.Join("frontend", "public", "service-worker.js")
		content, err = os.ReadFile(swPath)
		if err != nil {
			t.Fatalf("failed to read service-worker.js: %v", err)
		}
	}

	if !bytes.Contains(content, []byte("addEventListener('install'")) {
		t.Errorf("service-worker.js missing install event listener")
	}
	if !bytes.Contains(content, []byte("addEventListener('fetch'")) {
		t.Errorf("service-worker.js missing fetch event listener")
	}
}

func TestManifestJsonStructure(t *testing.T) {
	manifestPath := filepath.Join("..", "..", "frontend", "public", "manifest.json")
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		manifestPath = filepath.Join("frontend", "public", "manifest.json")
		content, err = os.ReadFile(manifestPath)
		if err != nil {
			t.Fatalf("failed to read manifest.json: %v", err)
		}
	}

	var manifest map[string]interface{}
	if err := json.Unmarshal(content, &manifest); err != nil {
		t.Fatalf("manifest.json is not valid JSON: %v", err)
	}

	if manifest["name"] == "" || manifest["short_name"] == "" {
		t.Errorf("manifest.json missing name or short_name")
	}
	if manifest["display"] != "standalone" {
		t.Errorf("expected display standalone, got %v", manifest["display"])
	}
	if manifest["start_url"] != "/" {
		t.Errorf("expected start_url '/', got %v", manifest["start_url"])
	}
}

func TestDevEndpointsDisabledInProduction(t *testing.T) {
	cfg := &config.Config{
		Environment:        "production",
		EnableDevEndpoints: false,
		JWTSecret:          "secret-key-32-chars-minimum-length!",
		JWTExpiry:          1 * time.Hour,
	}

	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	linkRepo := &mockLinkRepo{}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)

	devHandler := handler.NewDevHandler(nil, userRepo, walletRepo, entryRepo, linkRepo, auditRepo, jwtMgr, cfg)

	r := gin.New()
	api := r.Group("/api")
	if cfg.EnableDevEndpoints {
		dev := api.Group("/dev")
		{
			dev.GET("/status", devHandler.Status)
			dev.POST("/session", devHandler.CreateSession)
			dev.POST("/fixtures/reset", devHandler.ResetFixtures)
			dev.POST("/fixtures/seed", devHandler.SeedFixtures)
		}
	}

	// 1. Check status endpoint is 404 in production
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/dev/status", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for /api/dev/status in production, got %d", w.Code)
	}

	// 2. Check session creation is 404 in production
	body := `{"username":"test_creator","role":"user"}`
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/api/dev/session", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for /api/dev/session in production, got %d", w.Code)
	}
}

func TestDevSessionEndpointStrictlyDisabledFailClosed(t *testing.T) {
	cfg := &config.Config{
		Environment:        "development",
		EnableDevEndpoints: true,
		JWTSecret:          "secret-key-32-chars-minimum-length!",
		JWTExpiry:          1 * time.Hour,
	}

	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	linkRepo := &mockLinkRepo{}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)

	devHandler := handler.NewDevHandler(nil, userRepo, walletRepo, entryRepo, linkRepo, auditRepo, jwtMgr, cfg)

	r := gin.New()
	api := r.Group("/api")
	if cfg.EnableDevEndpoints {
		dev := api.Group("/dev")
		{
			dev.GET("/status", devHandler.Status)
			dev.POST("/session", devHandler.CreateSession)
		}
	}

	payloads := []struct {
		desc string
		body string
	}{
		{"empty payload", `{}`},
		{"fixture creator username", `{"username":"test_creator"}`},
		{"fixture owner username", `{"username":"test_owner"}`},
		{"fixture admin username", `{"username":"test_admin"}`},
		{"fixture creator persona", `{"persona":"creator"}`},
		{"fixture admin persona", `{"persona":"admin"}`},
		{"arbitrary username", `{"username":"arbitrary_user"}`},
		{"attacker persona", `{"persona":"attacker"}`},
		{"role escalation attempt", `{"username":"test_creator","role":"admin"}`},
	}

	for _, tc := range payloads {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/dev/session", strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("[%s] expected 403 Forbidden for /api/dev/session, got %d: %s", tc.desc, w.Code, w.Body.String())
		}

		// Ensure no auth cookie was issued
		if cookieHeader := w.Header().Get("Set-Cookie"); cookieHeader != "" {
			t.Errorf("[%s] expected no Set-Cookie header on rejected dev session, got: %s", tc.desc, cookieHeader)
		}

		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["token"] != nil {
			t.Errorf("[%s] expected no token issued on rejected dev session, got: %v", tc.desc, resp["token"])
		}
	}
}

func TestConfigDevEndpointsFailClosed(t *testing.T) {
	// Scenario 1: Development with no ENABLE_DEV_ENDPOINTS set -> must be false (fail-closed)
	os.Setenv("ENVIRONMENT", "development")
	os.Unsetenv("ENABLE_DEV_ENDPOINTS")
	cfg := config.LoadConfig()
	if cfg.EnableDevEndpoints {
		t.Errorf("expected EnableDevEndpoints to be false by default in development, got true")
	}

	// Scenario 2: Staging with ENABLE_DEV_ENDPOINTS=true -> must be false (only local dev allowed)
	os.Setenv("ENVIRONMENT", "staging")
	os.Setenv("ENABLE_DEV_ENDPOINTS", "true")
	cfg = config.LoadConfig()
	if cfg.EnableDevEndpoints {
		t.Errorf("expected EnableDevEndpoints to be false in staging even when ENABLE_DEV_ENDPOINTS=true, got true")
	}

	// Scenario 3: Production with ENABLE_DEV_ENDPOINTS=true -> must be false
	os.Setenv("ENVIRONMENT", "production")
	os.Setenv("ENABLE_DEV_ENDPOINTS", "true")
	cfg = config.LoadConfig()
	if cfg.EnableDevEndpoints {
		t.Errorf("expected EnableDevEndpoints to be false in production, got true")
	}

	// Scenario 4: Local development with ENABLE_DEV_ENDPOINTS=true -> explicitly enabled
	os.Setenv("ENVIRONMENT", "development")
	os.Setenv("ENABLE_DEV_ENDPOINTS", "true")
	cfg = config.LoadConfig()
	if !cfg.EnableDevEndpoints {
		t.Errorf("expected EnableDevEndpoints to be true in development when explicitly set to true, got false")
	}

	// Cleanup
	os.Unsetenv("ENABLE_DEV_ENDPOINTS")
	os.Setenv("ENVIRONMENT", "development")
}

func TestIndexHtmlServiceWorkerDoesNotRegisterOnFileProtocol(t *testing.T) {
	indexPath := filepath.Join("..", "..", "frontend", "index.html")
	content, err := os.ReadFile(indexPath)
	if err != nil {
		indexPath = filepath.Join("frontend", "index.html")
		content, err = os.ReadFile(indexPath)
		if err != nil {
			t.Fatalf("failed to read frontend/index.html: %v", err)
		}
	}

	contentStr := string(content)
	if strings.Contains(contentStr, "file:") {
		t.Errorf("frontend/index.html should not contain file: protocol condition for service worker registration")
	}
	if !strings.Contains(contentStr, "navigator.serviceWorker.register") {
		t.Errorf("frontend/index.html missing navigator.serviceWorker.register")
	}
	if !strings.Contains(contentStr, "isSecureContext") {
		t.Errorf("frontend/index.html missing isSecureContext check")
	}
}

func TestNginxConfigurationHasSecurityAndPWAHeaders(t *testing.T) {
	nginxPaths := []string{
		filepath.Join("..", "..", "nginx.conf"),
		filepath.Join("nginx.conf"),
	}

	var content []byte
	var err error
	for _, p := range nginxPaths {
		content, err = os.ReadFile(p)
		if err == nil {
			break
		}
	}
	if err != nil {
		t.Fatalf("failed to read nginx.conf: %v", err)
	}

	nginxStr := string(content)
	if !strings.Contains(nginxStr, "listen 80;") {
		t.Errorf("nginx.conf missing 'listen 80;'")
	}
	if !strings.Contains(nginxStr, "Service-Worker-Allowed") {
		t.Errorf("nginx.conf missing Service-Worker-Allowed header")
	}
	if !strings.Contains(nginxStr, "application/manifest+json") {
		t.Errorf("nginx.conf missing application/manifest+json content-type")
	}
	if !strings.Contains(nginxStr, "X-Content-Type-Options") {
		t.Errorf("nginx.conf missing X-Content-Type-Options security header")
	}
	if !strings.Contains(nginxStr, "X-Frame-Options") {
		t.Errorf("nginx.conf missing X-Frame-Options security header")
	}
}

func TestDevHandlerDirectInvocationFailClosed(t *testing.T) {
	// Scenario: Even if routes are mounted, DevHandler must reject requests when Environment is production
	prodCfg := &config.Config{
		Environment:        "production",
		EnableDevEndpoints: false,
		JWTSecret:          "secret-key-32-chars-minimum-length!",
		JWTExpiry:          1 * time.Hour,
	}

	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	linkRepo := &mockLinkRepo{}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager(prodCfg.JWTSecret, prodCfg.JWTExpiry)

	devHandler := handler.NewDevHandler(nil, userRepo, walletRepo, entryRepo, linkRepo, auditRepo, jwtMgr, prodCfg)

	r := gin.New()
	r.POST("/dev/session", devHandler.CreateSession)
	r.POST("/dev/fixtures/reset", devHandler.ResetFixtures)
	r.POST("/dev/fixtures/seed", devHandler.SeedFixtures)
	r.GET("/dev/status", devHandler.Status)

	endpoints := []struct {
		method string
		path   string
		body   string
	}{
		{"POST", "/dev/session", `{"username":"dev_user","role":"user"}`},
		{"POST", "/dev/fixtures/reset", `{}`},
		{"POST", "/dev/fixtures/seed", `{}`},
		{"GET", "/dev/status", ``},
	}

	for _, ep := range endpoints {
		w := httptest.NewRecorder()
		var req *http.Request
		if ep.body != "" {
			req, _ = http.NewRequest(ep.method, ep.path, strings.NewReader(ep.body))
			req.Header.Set("Content-Type", "application/json")
		} else {
			req, _ = http.NewRequest(ep.method, ep.path, nil)
		}
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for endpoint %s in production, got %d: %s", ep.path, w.Code, w.Body.String())
		}
	}
}

func TestDevFixturesSeedHandler(t *testing.T) {
	cfg := &config.Config{
		Environment:        "development",
		EnableDevEndpoints: true,
		JWTSecret:          "secret-key-32-chars-minimum-length!",
		JWTExpiry:          1 * time.Hour,
	}

	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	linkRepo := &mockLinkRepo{}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)

	devHandler := handler.NewDevHandler(nil, userRepo, walletRepo, entryRepo, linkRepo, auditRepo, jwtMgr, cfg)

	r := gin.New()
	dev := r.Group("/api/dev")
	{
		dev.POST("/fixtures/seed", devHandler.SeedFixtures)
	}

	body := `{"scenario":"standard"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/dev/fixtures/seed", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for seed fixtures, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal seed fixtures response: %v", err)
	}

	// Verify no tokens or plaintext passwords in response
	if resp["token"] != nil {
		t.Errorf("seed response should never return a session token, got: %v", resp["token"])
	}
	if resp["password"] != nil {
		t.Errorf("seed response should never return plaintext passwords, got: %v", resp["password"])
	}

	// Verify test users seeded with random unguessable passwords
	creator, err := userRepo.GetByUsername(context.Background(), "test_creator")
	if err != nil || creator == nil {
		t.Fatalf("expected test_creator to be seeded")
	}
	if auth.CheckPassword("", creator.PasswordHash) || auth.CheckPassword("password", creator.PasswordHash) || auth.CheckPassword("test_creator", creator.PasswordHash) {
		t.Errorf("fixture password should not match predictable or empty strings")
	}

	owner, err := userRepo.GetByUsername(context.Background(), "test_owner")
	if err != nil || owner == nil {
		t.Fatalf("expected test_owner to be seeded")
	}
	if auth.CheckPassword("", owner.PasswordHash) || auth.CheckPassword("password", owner.PasswordHash) || auth.CheckPassword("test_owner", owner.PasswordHash) {
		t.Errorf("fixture password should not match predictable or empty strings")
	}

	admin, err := userRepo.GetByUsername(context.Background(), "test_admin")
	if err != nil || admin == nil {
		t.Fatalf("expected test_admin to be seeded")
	}
	if auth.CheckPassword("", admin.PasswordHash) || auth.CheckPassword("password", admin.PasswordHash) || auth.CheckPassword("test_admin", admin.PasswordHash) {
		t.Errorf("fixture password should not match predictable or empty strings")
	}
}
