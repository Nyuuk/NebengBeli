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
	ErrLinkAlreadyProcessed  = errors.New("link request has already been resolved")
	ErrCannotLinkSelf        = errors.New("cannot link a wallet to yourself")
	ErrWalletAlreadyHasOwner = errors.New("wallet is already linked to an owner")
)

type LinkService interface {
	CreateLinkRequest(ctx context.Context, requestedBy uuid.UUID, walletID uuid.UUID, targetUsername string) (*model.LinkRequest, error)
	ApproveLinkRequest(ctx context.Context, userID uuid.UUID, id uuid.UUID) (*model.LinkRequest, error)
	RejectLinkRequest(ctx context.Context, userID uuid.UUID, id uuid.UUID) (*model.LinkRequest, error)
	GetLinkRequest(ctx context.Context, id uuid.UUID) (*model.LinkRequest, error)
	ListUserLinkRequests(ctx context.Context, userID uuid.UUID) ([]model.LinkRequest, error)
}

type linkService struct {
	linkRepo   repository.LinkRequestRepository
	walletRepo repository.WalletRepository
	userRepo   repository.UserRepository
	auditRepo  repository.AuditRepository
}

func NewLinkService(
	linkRepo repository.LinkRequestRepository,
	walletRepo repository.WalletRepository,
	userRepo repository.UserRepository,
	auditRepo repository.AuditRepository,
) LinkService {
	return &linkService{
		linkRepo:   linkRepo,
		walletRepo: walletRepo,
		userRepo:   userRepo,
		auditRepo:  auditRepo,
	}
}

func (s *linkService) CreateLinkRequest(ctx context.Context, requestedBy uuid.UUID, walletID uuid.UUID, targetUsername string) (*model.LinkRequest, error) {
	wallet, err := s.walletRepo.GetByID(ctx, walletID)
	if err != nil {
		return nil, err
	}
	if wallet.CreatorID != requestedBy {
		return nil, ErrWalletPermissionDenied
	}
	if wallet.ArchivedAt != nil {
		return nil, ErrArchivedWallet
	}

	if targetUsername == "" {
		return nil, errors.New("target username is required")
	}

	targetUser, err := s.userRepo.GetByUsername(ctx, targetUsername)
	if err != nil {
		return nil, fmt.Errorf("target user '%s' not found: %w", targetUsername, err)
	}
	if targetUser.ID == requestedBy {
		return nil, ErrCannotLinkSelf
	}

	req := &model.LinkRequest{
		WalletID:     walletID,
		RequestedBy:  requestedBy,
		TargetUserID: targetUser.ID,
		Status:       model.LinkRequestStatusPending,
	}

	if err := s.linkRepo.Create(ctx, req); err != nil {
		return nil, fmt.Errorf("failed to create link request: %w", err)
	}

	meta, _ := json.Marshal(map[string]interface{}{
		"wallet_id":       walletID,
		"target_user_id":  targetUser.ID,
		"target_username": targetUsername,
	})
	entityID := req.ID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &requestedBy,
		Action:     string(model.AuditActionLinkRequestCreate),
		TargetType: "link_request",
		TargetID:   &entityID,
		Metadata:   meta,
	})

	return s.linkRepo.GetByID(ctx, req.ID)
}

func (s *linkService) ApproveLinkRequest(ctx context.Context, userID uuid.UUID, id uuid.UUID) (*model.LinkRequest, error) {
	req, err := s.linkRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Status != model.LinkRequestStatusPending {
		return nil, ErrLinkAlreadyProcessed
	}

	if req.TargetUserID != userID {
		return nil, errors.New("this link request was directed to a different user")
	}

	// Update wallet owner
	if err := s.walletRepo.SetOwner(ctx, req.WalletID, userID); err != nil {
		return nil, fmt.Errorf("failed to link wallet to owner: %w", err)
	}

	// Update link request status
	if err := s.linkRepo.UpdateStatus(ctx, req.ID, model.LinkRequestStatusApproved); err != nil {
		return nil, err
	}

	meta, _ := json.Marshal(map[string]interface{}{
		"wallet_id": req.WalletID,
		"user_id":   userID,
	})
	entityID := req.ID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &userID,
		Action:     string(model.AuditActionLinkRequestApprove),
		TargetType: "link_request",
		TargetID:   &entityID,
		Metadata:   meta,
	})

	return s.linkRepo.GetByID(ctx, req.ID)
}

func (s *linkService) RejectLinkRequest(ctx context.Context, userID uuid.UUID, id uuid.UUID) (*model.LinkRequest, error) {
	req, err := s.linkRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Status != model.LinkRequestStatusPending {
		return nil, ErrLinkAlreadyProcessed
	}

	if req.TargetUserID != userID && req.RequestedBy != userID {
		return nil, errors.New("you do not have permission to reject this link request")
	}

	if err := s.linkRepo.UpdateStatus(ctx, req.ID, model.LinkRequestStatusRejected); err != nil {
		return nil, err
	}

	meta, _ := json.Marshal(map[string]interface{}{
		"wallet_id": req.WalletID,
		"user_id":   userID,
	})
	entityID := req.ID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &userID,
		Action:     string(model.AuditActionLinkRequestReject),
		TargetType: "link_request",
		TargetID:   &entityID,
		Metadata:   meta,
	})

	return s.linkRepo.GetByID(ctx, req.ID)
}

func (s *linkService) GetLinkRequest(ctx context.Context, id uuid.UUID) (*model.LinkRequest, error) {
	return s.linkRepo.GetByID(ctx, id)
}

func (s *linkService) ListUserLinkRequests(ctx context.Context, userID uuid.UUID) ([]model.LinkRequest, error) {
	return s.linkRepo.ListForUser(ctx, userID)
}
