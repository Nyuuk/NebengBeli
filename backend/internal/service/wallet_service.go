package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
)

var (
	ErrWalletPermissionDenied = errors.New("you do not have permission to access or modify this wallet")
	ErrWalletNameEmpty        = errors.New("wallet name cannot be empty")
)

type WalletService interface {
	CreateWallet(ctx context.Context, userID uuid.UUID, name string, targetOwnerUsername string) (*model.Wallet, error)
	GetWallet(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole) (*model.Wallet, error)
	UpdateWalletName(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, newName string) error
	SetWalletArchived(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, archive bool) error
	ListUserWallets(ctx context.Context, userID uuid.UUID, includeArchived bool) ([]model.Wallet, error)
	ListAllWallets(ctx context.Context, limit, offset int) ([]model.Wallet, int64, error)
}

type walletService struct {
	walletRepo repository.WalletRepository
	userRepo   repository.UserRepository
	auditRepo  repository.AuditRepository
}

func NewWalletService(
	walletRepo repository.WalletRepository,
	userRepo repository.UserRepository,
	auditRepo repository.AuditRepository,
) WalletService {
	return &walletService{
		walletRepo: walletRepo,
		userRepo:   userRepo,
		auditRepo:  auditRepo,
	}
}

func (s *walletService) CreateWallet(ctx context.Context, userID uuid.UUID, name string, targetOwnerUsername string) (*model.Wallet, error) {
	if name == "" {
		return nil, ErrWalletNameEmpty
	}

	var targetOwnerID *uuid.UUID
	if targetOwnerUsername != "" {
		targetUser, err := s.userRepo.GetByUsername(ctx, targetOwnerUsername)
		if err == nil && targetUser != nil {
			targetOwnerID = &targetUser.ID
		}
	}

	wallet := &model.Wallet{
		Name:      name,
		CreatorID: userID,
		OwnerID:   targetOwnerID,
	}

	if err := s.walletRepo.Create(ctx, wallet); err != nil {
		return nil, fmt.Errorf("failed to create wallet: %w", err)
	}

	meta, _ := json.Marshal(map[string]interface{}{
		"wallet_name": name,
		"owner_id":    targetOwnerID,
	})
	entityID := wallet.ID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &userID,
		Action:     string(model.AuditActionWalletCreate),
		TargetType: "wallet",
		TargetID:   &entityID,
		Metadata:   meta,
	})

	return s.walletRepo.GetByIDWithDetails(ctx, wallet.ID, &userID)
}

func (s *walletService) GetWallet(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole) (*model.Wallet, error) {
	if userRole != model.RoleAdmin {
		authorized, err := s.walletRepo.IsUserAuthorized(ctx, walletID, userID)
		if err != nil {
			return nil, err
		}
		if !authorized {
			return nil, ErrWalletPermissionDenied
		}
	}

	return s.walletRepo.GetByIDWithDetails(ctx, walletID, &userID)
}

func (s *walletService) UpdateWalletName(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, newName string) error {
	if newName == "" {
		return ErrWalletNameEmpty
	}

	if userRole != model.RoleAdmin {
		authorized, err := s.walletRepo.IsUserAuthorized(ctx, walletID, userID)
		if err != nil {
			return err
		}
		if !authorized {
			return ErrWalletPermissionDenied
		}
	}

	if err := s.walletRepo.UpdateName(ctx, walletID, newName); err != nil {
		return err
	}

	entityID := walletID.String()
	meta, _ := json.Marshal(map[string]interface{}{"new_name": newName})
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &userID,
		Action:     string(model.AuditActionWalletUpdate),
		TargetType: "wallet",
		TargetID:   &entityID,
		Metadata:   meta,
	})

	return nil
}

func (s *walletService) SetWalletArchived(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, archive bool) error {
	if userRole != model.RoleAdmin {
		authorized, err := s.walletRepo.IsUserAuthorized(ctx, walletID, userID)
		if err != nil {
			return err
		}
		if !authorized {
			return ErrWalletPermissionDenied
		}
	}

	if err := s.walletRepo.SetArchived(ctx, walletID, archive); err != nil {
		return err
	}

	action := model.AuditActionWalletArchive
	if !archive {
		action = model.AuditActionWalletUnarchive
	}

	entityID := walletID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &userID,
		Action:     string(action),
		TargetType: "wallet",
		TargetID:   &entityID,
		Metadata:   []byte("{}"),
	})

	return nil
}

func (s *walletService) ListUserWallets(ctx context.Context, userID uuid.UUID, includeArchived bool) ([]model.Wallet, error) {
	return s.walletRepo.ListByUser(ctx, userID, includeArchived)
}

func (s *walletService) ListAllWallets(ctx context.Context, limit, offset int) ([]model.Wallet, int64, error) {
	return s.walletRepo.ListAll(ctx, limit, offset)
}
