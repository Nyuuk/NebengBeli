package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
)

var (
	ErrInvalidCredentials = errors.New("invalid username or password")
	ErrUnauthorized       = errors.New("unauthorized")
	ErrTokenRevoked       = errors.New("token has been revoked")
)

type AuthService interface {
	Register(ctx context.Context, username, password string) (*model.UserResponse, string, time.Time, error)
	Login(ctx context.Context, username, password string) (*model.UserResponse, string, time.Time, error)
	RenewToken(ctx context.Context, userID uuid.UUID, tokenVersion int) (*model.UserResponse, string, time.Time, error)
	Logout(ctx context.Context, userID uuid.UUID) error
	GetCurrentUser(ctx context.Context, userID uuid.UUID, tokenVersion int) (*model.User, error)
	ResetPassword(ctx context.Context, userID uuid.UUID, newPassword string) error
	AdminResetPassword(ctx context.Context, adminID uuid.UUID, targetUsername, newPassword string) error
	SeedAdminUser(ctx context.Context, username, password string) error
}

type authService struct {
	userRepo  repository.UserRepository
	auditRepo repository.AuditRepository
	jwtMgr    *auth.JWTManager
}

func NewAuthService(
	userRepo repository.UserRepository,
	auditRepo repository.AuditRepository,
	jwtMgr *auth.JWTManager,
) AuthService {
	return &authService{
		userRepo:  userRepo,
		auditRepo: auditRepo,
		jwtMgr:    jwtMgr,
	}
}

func (s *authService) Register(ctx context.Context, username, password string) (*model.UserResponse, string, time.Time, error) {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("invalid password: %w", err)
	}

	user := &model.User{
		Username:     username,
		PasswordHash: hash,
		Role:         model.RoleUser,
		TokenVersion: 1,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, "", time.Time{}, err
	}

	token, err := s.jwtMgr.GenerateToken(user)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("failed to generate token: %w", err)
	}

	expiresAt := time.Now().Add(s.jwtMgr.GetTokenDuration())

	// Audit log
	meta, _ := json.Marshal(map[string]interface{}{"username": username})
	entityID := user.ID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &user.ID,
		Action:     string(model.AuditActionUserRegister),
		TargetType: "user",
		TargetID:   &entityID,
		Metadata:   meta,
	})

	resp := user.ToResponse()
	return &resp, token, expiresAt, nil
}

func (s *authService) Login(ctx context.Context, username, password string) (*model.UserResponse, string, time.Time, error) {
	user, err := s.userRepo.GetByUsername(ctx, username)
	if err != nil {
		return nil, "", time.Time{}, ErrInvalidCredentials
	}

	if !auth.CheckPassword(password, user.PasswordHash) {
		return nil, "", time.Time{}, ErrInvalidCredentials
	}

	token, err := s.jwtMgr.GenerateToken(user)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("failed to generate token: %w", err)
	}

	expiresAt := time.Now().Add(s.jwtMgr.GetTokenDuration())

	// Audit log
	meta, _ := json.Marshal(map[string]interface{}{"username": username})
	entityID := user.ID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &user.ID,
		Action:     string(model.AuditActionUserLogin),
		TargetType: "user",
		TargetID:   &entityID,
		Metadata:   meta,
	})

	resp := user.ToResponse()
	return &resp, token, expiresAt, nil
}

func (s *authService) RenewToken(ctx context.Context, userID uuid.UUID, tokenVersion int) (*model.UserResponse, string, time.Time, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, "", time.Time{}, ErrUnauthorized
	}

	if user.TokenVersion != tokenVersion {
		return nil, "", time.Time{}, ErrTokenRevoked
	}

	token, err := s.jwtMgr.GenerateToken(user)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("failed to generate token: %w", err)
	}

	expiresAt := time.Now().Add(s.jwtMgr.GetTokenDuration())

	entityID := user.ID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &user.ID,
		Action:     string(model.AuditActionUserRenew),
		TargetType: "user",
		TargetID:   &entityID,
		Metadata:   []byte("{}"),
	})

	resp := user.ToResponse()
	return &resp, token, expiresAt, nil
}

func (s *authService) Logout(ctx context.Context, userID uuid.UUID) error {
	// Increment token version to invalidate all current tokens for this user
	_, err := s.userRepo.IncrementTokenVersion(ctx, userID)
	if err != nil {
		return err
	}

	entityID := userID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &userID,
		Action:     string(model.AuditActionUserLogout),
		TargetType: "user",
		TargetID:   &entityID,
		Metadata:   []byte("{}"),
	})

	return nil
}

func (s *authService) GetCurrentUser(ctx context.Context, userID uuid.UUID, tokenVersion int) (*model.User, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, ErrUnauthorized
	}

	if user.TokenVersion != tokenVersion {
		return nil, ErrTokenRevoked
	}

	return user, nil
}

func (s *authService) ResetPassword(ctx context.Context, userID uuid.UUID, newPassword string) error {
	hash, err := auth.HashPassword(newPassword)
	if err != nil {
		return err
	}

	if err := s.userRepo.UpdatePassword(ctx, userID, hash); err != nil {
		return err
	}

	entityID := userID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &userID,
		Action:     string(model.AuditActionUserPasswordReset),
		TargetType: "user",
		TargetID:   &entityID,
		Metadata:   []byte(`{"reset_by":"self"}`),
	})

	return nil
}

func (s *authService) AdminResetPassword(ctx context.Context, adminID uuid.UUID, targetUsername, newPassword string) error {
	targetUser, err := s.userRepo.GetByUsername(ctx, targetUsername)
	if err != nil {
		return err
	}

	hash, err := auth.HashPassword(newPassword)
	if err != nil {
		return err
	}

	if err := s.userRepo.UpdatePassword(ctx, targetUser.ID, hash); err != nil {
		return err
	}

	entityID := targetUser.ID.String()
	meta, _ := json.Marshal(map[string]interface{}{
		"target_username": targetUsername,
		"admin_id":        adminID.String(),
	})
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &adminID,
		Action:     string(model.AuditActionUserPasswordReset),
		TargetType: "user",
		TargetID:   &entityID,
		Metadata:   meta,
	})

	return nil
}

func (s *authService) SeedAdminUser(ctx context.Context, username, password string) error {
	_, err := s.userRepo.GetByUsername(ctx, username)
	if err == nil {
		// Admin already exists
		return nil
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}

	admin := &model.User{
		Username:     username,
		PasswordHash: hash,
		Role:         model.RoleAdmin,
		TokenVersion: 1,
	}

	return s.userRepo.Create(ctx, admin)
}
