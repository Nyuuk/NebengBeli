package tests

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/model"
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
