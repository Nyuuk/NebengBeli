package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
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
	"github.com/nyuuk/nebengbeli/internal/repository"
	"github.com/nyuuk/nebengbeli/internal/service"
)

// TestModelUsernameValidation tests format validation in model.IsValidUsername.
func TestModelUsernameValidation(t *testing.T) {
	validUsernames := []string{
		"adnan_dev",
		"john_doe",
		"user123",
		"abc",
		"a_1",
		"max_length_username_exactly_30",
	}

	for _, u := range validUsernames {
		if !model.IsValidUsername(u) {
			t.Errorf("expected '%s' to be valid username, got invalid", u)
		}
	}

	invalidUsernames := []string{
		"",                               // empty
		"ab",                             // too short (< 3)
		"this_username_is_way_too_long_exceeding_30_chars", // > 30
		"JohnDoe",                        // uppercase
		"john doe",                       // contains space
		"john@dev",                       // symbol @
		"john-doe",                       // hyphen not allowed
		"john.doe",                       // period not allowed
		" user",                          // leading space
		"user ",                          // trailing space
		"admin!",                         // exclamation mark
	}

	for _, u := range invalidUsernames {
		if model.IsValidUsername(u) {
			t.Errorf("expected '%s' to be invalid username, got valid", u)
		}
	}
}

// TestUserResponseNeedsUsernameUpdate tests calculation of NeedsUsernameUpdate flag.
func TestUserResponseNeedsUsernameUpdate(t *testing.T) {
	standardUser := &model.User{
		ID:        uuid.New(),
		Username:  "valid_user",
		Role:      model.RoleUser,
		CreatedAt: time.Now(),
	}
	resp := standardUser.ToResponse()
	if resp.NeedsUsernameUpdate {
		t.Errorf("expected NeedsUsernameUpdate=false for standard username, got true")
	}

	legacyUserUpper := &model.User{
		ID:        uuid.New(),
		Username:  "LegacyUser",
		Role:      model.RoleUser,
		CreatedAt: time.Now(),
	}
	respUpper := legacyUserUpper.ToResponse()
	if !respUpper.NeedsUsernameUpdate {
		t.Errorf("expected NeedsUsernameUpdate=true for uppercase legacy username, got false")
	}

	legacyUserSpace := &model.User{
		ID:        uuid.New(),
		Username:  "legacy user with spaces",
		Role:      model.RoleUser,
		CreatedAt: time.Now(),
	}
	respSpace := legacyUserSpace.ToResponse()
	if !respSpace.NeedsUsernameUpdate {
		t.Errorf("expected NeedsUsernameUpdate=true for spaced legacy username, got false")
	}
}

// TestUsernameRegistrationValidationAndDuplicate tests registration format rejection and case-insensitive uniqueness.
func TestUsernameRegistrationValidationAndDuplicate(t *testing.T) {
	jwtSecret := "test-secret-32-chars-long-minimum!"
	jwtMgr := auth.NewJWTManager(jwtSecret, 1*time.Hour)

	userRepo := &mockUserRepo{
		users:     make(map[string]*model.User),
		usersByID: make(map[uuid.UUID]*model.User),
	}
	auditRepo := &mockAuditRepo{}
	authSvc := service.NewAuthService(userRepo, auditRepo, jwtMgr)

	ctx := context.Background()

	// 1. Invalid username formats rejected
	invalidInputs := []struct {
		username string
		desc     string
	}{
		{"ab", "too short"},
		{"john doe", "contains space"},
		{"john@doe", "contains symbol"},
		{"user!name", "contains exclamation"},
		{"a_very_long_username_that_exceeds_thirty_chars", "too long"},
	}

	for _, tc := range invalidInputs {
		_, _, _, err := authSvc.Register(ctx, tc.username, "Password123!")
		if err == nil {
			t.Errorf("expected error for %s (%s), got nil", tc.username, tc.desc)
		} else if !strings.Contains(err.Error(), "username hanya boleh berisi") {
			t.Errorf("expected validation message for %s, got: %v", tc.username, err)
		}
	}

	// 2. Successful registration with valid username
	resp, _, _, err := authSvc.Register(ctx, "john_doe", "Password123!")
	if err != nil {
		t.Fatalf("failed to register valid user: %v", err)
	}
	if resp.Username != "john_doe" {
		t.Errorf("expected registered username 'john_doe', got '%s'", resp.Username)
	}
	if resp.NeedsUsernameUpdate {
		t.Errorf("expected NeedsUsernameUpdate=false for valid user")
	}

	// 3. Duplicate registration rejected case-insensitively
	duplicateInputs := []string{"john_doe", "JOHN_DOE", "John_Doe", " JoHn_DoE "}
	for _, dup := range duplicateInputs {
		_, _, _, err := authSvc.Register(ctx, dup, "Password123!")
		if err == nil {
			t.Errorf("expected duplicate error for registering '%s', got nil", dup)
		} else if err != repository.ErrUsernameDuplicate {
			t.Errorf("expected ErrUsernameDuplicate for '%s', got: %v", dup, err)
		}
	}
}

// TestUsernameMigrationLifecycleAPI tests the full HTTP lifecycle:
// login legacy user, check needs_username_update, update username, cookie refresh, audit log,
// and rejection of standard users or duplicates.
func TestUsernameMigrationLifecycleAPI(t *testing.T) {
	jwtSecret := "test-secret-32-chars-long-minimum!"
	jwtMgr := auth.NewJWTManager(jwtSecret, 1*time.Hour)

	userRepo := &mockUserRepo{
		users:     make(map[string]*model.User),
		usersByID: make(map[uuid.UUID]*model.User),
	}
	auditRepo := &mockAuditRepo{}
	authSvc := service.NewAuthService(userRepo, auditRepo, jwtMgr)

	cfg := &config.Config{
		JWTSecret:    jwtSecret,
		JWTExpiry:    1 * time.Hour,
		CookieSecure: false,
	}
	authHandler := handler.NewAuthHandler(authSvc, cfg)

	r := gin.New()
	api := r.Group("/api")
	{
		api.POST("/auth/register", authHandler.Register)
		api.POST("/auth/login", authHandler.Login)

		authRequired := api.Group("")
		authRequired.Use(middleware.AuthMiddleware(jwtMgr, authSvc))
		{
			authRequired.PUT("/auth/username", authHandler.UpdateUsername)
		}
	}

	// Seed 1: Legacy user with uppercase and spaces
	legacyPassword := "LegacySecret123!"
	legacyHash, _ := auth.HashPassword(legacyPassword)
	legacyUser := &model.User{
		ID:           uuid.New(),
		Username:     "Old Captain",
		PasswordHash: legacyHash,
		Role:         model.RoleUser,
		TokenVersion: 1,
		CreatedAt:    time.Now().Add(-24 * time.Hour),
	}
	userRepo.users[legacyUser.Username] = legacyUser
	userRepo.usersByID[legacyUser.ID] = legacyUser

	// Seed 2: Another user to test duplicate collision
	existingUserPassword := "Existing123!"
	existingHash, _ := auth.HashPassword(existingUserPassword)
	existingUser := &model.User{
		ID:           uuid.New(),
		Username:     "taken_username",
		PasswordHash: existingHash,
		Role:         model.RoleUser,
		TokenVersion: 1,
		CreatedAt:    time.Now().Add(-10 * time.Hour),
	}
	userRepo.users[existingUser.Username] = existingUser
	userRepo.usersByID[existingUser.ID] = existingUser

	// Step 1: Login legacy user -> succeeds with needs_username_update=true
	loginBody, _ := json.Marshal(map[string]string{
		"username": "Old Captain",
		"password": legacyPassword,
	})
	wLogin := httptest.NewRecorder()
	reqLogin, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(loginBody))
	reqLogin.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(wLogin, reqLogin)

	if wLogin.Code != http.StatusOK {
		t.Fatalf("legacy login failed: code %d, body: %s", wLogin.Code, wLogin.Body.String())
	}

	var loginResp struct {
		User struct {
			ID                  string `json:"id"`
			Username            string `json:"username"`
			NeedsUsernameUpdate bool   `json:"needs_username_update"`
		} `json:"user"`
	}
	if err := json.Unmarshal(wLogin.Body.Bytes(), &loginResp); err != nil {
		t.Fatalf("failed to decode login response: %v", err)
	}

	if !loginResp.User.NeedsUsernameUpdate {
		t.Errorf("expected needs_username_update=true for legacy user, got false")
	}
	if loginResp.User.Username != "Old Captain" {
		t.Errorf("expected username 'Old Captain', got '%s'", loginResp.User.Username)
	}

	// Capture auth cookie
	authCookie := wLogin.Header().Get("Set-Cookie")
	if authCookie == "" {
		t.Fatalf("expected Set-Cookie on login")
	}

	// Step 2: Legacy user tries invalid updates -> all rejected
	invalidUpdates := []struct {
		username       string
		expectedStatus int
		desc           string
	}{
		{"", http.StatusBadRequest, "empty username"},
		{"ab", http.StatusBadRequest, "too short"},
		{"new name", http.StatusBadRequest, "contains space"},
		{"new@name", http.StatusBadRequest, "contains symbol"},
		{"taken_username", http.StatusConflict, "already taken"},
		{"TAKEN_USERNAME", http.StatusConflict, "already taken case-insensitive"},
	}

	for _, tc := range invalidUpdates {
		payload, _ := json.Marshal(map[string]string{"username": tc.username})
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("PUT", "/api/auth/username", bytes.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", authCookie)
		r.ServeHTTP(w, req)

		if w.Code != tc.expectedStatus {
			t.Errorf("expected status %d for updating to '%s' (%s), got %d, body: %s",
				tc.expectedStatus, tc.username, tc.desc, w.Code, w.Body.String())
		}
	}

	// Step 3: Legacy user updates to a valid new username -> succeeds
	updateBody, _ := json.Marshal(map[string]string{
		"username": "captain_clean",
	})
	wUpdate := httptest.NewRecorder()
	reqUpdate, _ := http.NewRequest("PUT", "/api/auth/username", bytes.NewReader(updateBody))
	reqUpdate.Header.Set("Content-Type", "application/json")
	reqUpdate.Header.Set("Cookie", authCookie)
	r.ServeHTTP(wUpdate, reqUpdate)

	if wUpdate.Code != http.StatusOK {
		t.Fatalf("update username failed: code %d, body: %s", wUpdate.Code, wUpdate.Body.String())
	}

	var updateResp struct {
		Message string `json:"message"`
		User    struct {
			ID                  string `json:"id"`
			Username            string `json:"username"`
			NeedsUsernameUpdate bool   `json:"needs_username_update"`
		} `json:"user"`
	}
	if err := json.Unmarshal(wUpdate.Body.Bytes(), &updateResp); err != nil {
		t.Fatalf("failed to decode update response: %v", err)
	}

	if updateResp.User.Username != "captain_clean" {
		t.Errorf("expected new username 'captain_clean', got '%s'", updateResp.User.Username)
	}
	if updateResp.User.NeedsUsernameUpdate {
		t.Errorf("expected needs_username_update=false after update, got true")
	}
	if updateResp.Message != "username berhasil diperbarui" {
		t.Errorf("unexpected message: %s", updateResp.Message)
	}

	// Verify new cookie issued
	newCookie := wUpdate.Header().Get("Set-Cookie")
	if newCookie == "" {
		t.Fatalf("expected Set-Cookie with new token after username update")
	}

	// Verify user in repository
	updatedUserInRepo, err := userRepo.GetByID(context.Background(), legacyUser.ID)
	if err != nil {
		t.Fatalf("failed to find user by ID in repo: %v", err)
	}
	if updatedUserInRepo.Username != "captain_clean" {
		t.Errorf("expected user in repo to have username 'captain_clean', got '%s'", updatedUserInRepo.Username)
	}

	// Verify audit log
	if len(auditRepo.logs) == 0 {
		t.Fatalf("expected audit log to be created for username update")
	}
	lastLog := auditRepo.logs[len(auditRepo.logs)-1]
	if lastLog.Action != "user_update_username" {
		t.Errorf("expected audit action 'user_update_username', got '%s'", lastLog.Action)
	}
	if lastLog.ActorID == nil || *lastLog.ActorID != legacyUser.ID {
		t.Errorf("expected audit ActorID %s, got %v", legacyUser.ID, lastLog.ActorID)
	}
	var meta map[string]string
	_ = json.Unmarshal(lastLog.Metadata, &meta)
	if meta["old_username"] != "Old Captain" || meta["new_username"] != "captain_clean" {
		t.Errorf("unexpected audit metadata: %v", meta)
	}

	// Step 4: User with standard username attempts to call PUT /api/auth/username -> rejected!
	secondUpdateBody, _ := json.Marshal(map[string]string{
		"username": "captain_again",
	})
	wSecond := httptest.NewRecorder()
	reqSecond, _ := http.NewRequest("PUT", "/api/auth/username", bytes.NewReader(secondUpdateBody))
	reqSecond.Header.Set("Content-Type", "application/json")
	reqSecond.Header.Set("Cookie", newCookie)
	r.ServeHTTP(wSecond, reqSecond)

	if wSecond.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request when standard user tries to update username, got %d", wSecond.Code)
	}
	if !strings.Contains(wSecond.Body.String(), "username yang sudah sesuai standar tidak dapat diubah") {
		t.Errorf("expected error message about standard username, got: %s", wSecond.Body.String())
	}

	// Step 5: Unauthenticated request rejected -> 401
	wUnauth := httptest.NewRecorder()
	reqUnauth, _ := http.NewRequest("PUT", "/api/auth/username", bytes.NewReader(updateBody))
	reqUnauth.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(wUnauth, reqUnauth)

	if wUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for request without auth, got %d", wUnauth.Code)
	}
}

// TestCLICreateAdminValidation tests CLI create-admin username validation.
func TestCLICreateAdminValidation(t *testing.T) {
	tempDir := t.TempDir()
	binPath := filepath.Join(tempDir, "nebengbeli-cli")

	cmd := exec.Command("go", "build", "-o", binPath, "../cmd/cli")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("failed to build cli binary: %v, output: %s", err, string(out))
	}

	// Running create-admin with invalid username format (e.g. contains space/symbols)
	cmdInvalid := exec.Command(binPath, "create-admin", "--username", "invalid admin!", "--password", "Secret123!")
	outInvalid, err := cmdInvalid.CombinedOutput()
	if err == nil {
		t.Errorf("expected create-admin with invalid username to exit with error")
	}
	if !strings.Contains(string(outInvalid), "username hanya boleh berisi") {
		t.Errorf("expected validation error in output, got: %s", string(outInvalid))
	}
}
