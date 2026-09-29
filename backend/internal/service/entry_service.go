package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
)

var (
	ErrArchivedWallet           = errors.New("cannot create entry in an archived wallet")
	ErrInvalidEntryType         = errors.New("invalid entry type: must be titipan, topup, or koreksi")
	ErrZeroAmount               = errors.New("amount cannot be zero")
	ErrItemNameRequired         = errors.New("item_name is required")
	ErrMissingCorrectionRef     = errors.New("correction entry must specify corrects_entry_id")
	ErrCannotCorrectNonExisting = errors.New("referenced entry for correction does not exist")
	ErrDestinationArchived      = errors.New("destination wallet is archived")
)

type CreateEntryRequest struct {
	ClientID         *uuid.UUID      `json:"client_id,omitempty"`
	WalletID         uuid.UUID       `json:"wallet_id"`
	Type             model.EntryType `json:"type"`
	Amount           int64           `json:"amount"`
	ItemName         string          `json:"item_name"`
	Note             string          `json:"note"`
	CorrectsEntryID  *uuid.UUID      `json:"corrects_entry_id,omitempty"`
	CorrectionReason string          `json:"correction_reason,omitempty"`
	OccurredAt       *time.Time      `json:"occurred_at,omitempty"`
}

type MoveEntryRequest struct {
	SourceWalletID uuid.UUID `json:"source_wallet_id"`
	TargetWalletID uuid.UUID `json:"target_wallet_id"`
	EntryID        uuid.UUID `json:"entry_id"`
	Notes          string    `json:"notes"`
}

type EntryService interface {
	CreateEntry(ctx context.Context, userID uuid.UUID, userRole model.UserRole, req CreateEntryRequest) (*model.Entry, bool, error)
	MoveEntry(ctx context.Context, userID uuid.UUID, userRole model.UserRole, req MoveEntryRequest) (*model.Entry, *model.Entry, error)
	GetEntry(ctx context.Context, entryID, userID uuid.UUID, userRole model.UserRole) (*model.Entry, error)
}

type entryService struct {
	entryRepo  repository.EntryRepository
	walletRepo repository.WalletRepository
	auditRepo  repository.AuditRepository
}

func NewEntryService(
	entryRepo repository.EntryRepository,
	walletRepo repository.WalletRepository,
	auditRepo repository.AuditRepository,
) EntryService {
	return &entryService{
		entryRepo:  entryRepo,
		walletRepo: walletRepo,
		auditRepo:  auditRepo,
	}
}

func (s *entryService) CreateEntry(ctx context.Context, userID uuid.UUID, userRole model.UserRole, req CreateEntryRequest) (*model.Entry, bool, error) {
	if req.WalletID == uuid.Nil {
		return nil, false, errors.New("wallet_id is required")
	}

	if req.ItemName == "" {
		return nil, false, ErrItemNameRequired
	}

	// 1. Authorization check
	if userRole != model.RoleAdmin {
		authz, err := s.walletRepo.IsUserAuthorized(ctx, req.WalletID, userID)
		if err != nil {
			return nil, false, err
		}
		if !authz {
			return nil, false, ErrWalletPermissionDenied
		}
	}

	// 2. Check wallet active status
	wallet, err := s.walletRepo.GetByID(ctx, req.WalletID)
	if err != nil {
		return nil, false, err
	}
	if wallet.ArchivedAt != nil {
		return nil, false, ErrArchivedWallet
	}

	// 3. Normalize amount and type
	if req.Amount == 0 {
		return nil, false, ErrZeroAmount
	}

	var signedAmount int64
	switch req.Type {
	case model.EntryTypeTitipan:
		// Titipan represents debt/spending on behalf (+signed)
		if req.Amount < 0 {
			signedAmount = -req.Amount
		} else {
			signedAmount = req.Amount
		}
	case model.EntryTypeTopup:
		// Topup represents payment/settlement (-signed)
		if req.Amount > 0 {
			signedAmount = -req.Amount
		} else {
			signedAmount = req.Amount
		}
	case model.EntryTypeKoreksi:
		if req.CorrectsEntryID == nil || *req.CorrectsEntryID == uuid.Nil {
			return nil, false, ErrMissingCorrectionRef
		}
		// Verify referenced entry
		refEntry, err := s.entryRepo.GetByID(ctx, *req.CorrectsEntryID)
		if err != nil {
			return nil, false, ErrCannotCorrectNonExisting
		}
		if refEntry.WalletID != req.WalletID {
			return nil, false, errors.New("referenced entry does not belong to this wallet")
		}
		if refEntry.Type == model.EntryTypeKoreksi {
			return nil, false, errors.New("cannot correct an entry of type koreksi")
		}
		// Koreksi preserves whatever sign is specified
		signedAmount = req.Amount
	default:
		return nil, false, ErrInvalidEntryType
	}

	// 4. Ensure client ID
	var clientID uuid.UUID
	if req.ClientID != nil && *req.ClientID != uuid.Nil {
		clientID = *req.ClientID
	} else {
		clientID = uuid.New()
	}

	occurredAt := time.Now().UTC()
	if req.OccurredAt != nil && !req.OccurredAt.IsZero() {
		occurredAt = req.OccurredAt.UTC()
	}

	entry := &model.Entry{
		ClientID:         clientID,
		WalletID:         req.WalletID,
		Type:             req.Type,
		Amount:           signedAmount,
		ItemName:         req.ItemName,
		Note:             req.Note,
		CorrectsEntryID:  req.CorrectsEntryID,
		CorrectionReason: req.CorrectionReason,
		OccurredAt:       occurredAt,
		CreatedBy:        userID,
	}

	created, isDuplicate, err := s.entryRepo.Create(ctx, entry)
	if err != nil {
		return nil, false, err
	}

	if !isDuplicate {
		meta, _ := json.Marshal(map[string]interface{}{
			"wallet_id": req.WalletID,
			"type":      req.Type,
			"amount":    signedAmount,
			"item_name": req.ItemName,
		})
		entityID := created.ID.String()
		action := model.AuditActionEntryCreate
		if req.Type == model.EntryTypeKoreksi {
			action = model.AuditActionEntryCorrect
		}
		_ = s.auditRepo.Create(ctx, &model.AuditLog{
			ActorID:    &userID,
			Action:     string(action),
			TargetType: "entry",
			TargetID:   &entityID,
			Metadata:   meta,
		})
	}

	return created, isDuplicate, nil
}

func (s *entryService) MoveEntry(ctx context.Context, userID uuid.UUID, userRole model.UserRole, req MoveEntryRequest) (*model.Entry, *model.Entry, error) {
	if req.SourceWalletID == req.TargetWalletID {
		return nil, nil, errors.New("source and destination wallets cannot be identical")
	}

	// 1. Authorization checks for both wallets
	if userRole != model.RoleAdmin {
		srcAuthz, err := s.walletRepo.IsUserAuthorized(ctx, req.SourceWalletID, userID)
		if err != nil || !srcAuthz {
			return nil, nil, ErrWalletPermissionDenied
		}
		dstAuthz, err := s.walletRepo.IsUserAuthorized(ctx, req.TargetWalletID, userID)
		if err != nil || !dstAuthz {
			return nil, nil, ErrWalletPermissionDenied
		}
	}

	// 2. Check destination wallet active
	dstWallet, err := s.walletRepo.GetByID(ctx, req.TargetWalletID)
	if err != nil {
		return nil, nil, err
	}
	if dstWallet.ArchivedAt != nil {
		return nil, nil, ErrDestinationArchived
	}

	corrEntry, newEntry, err := s.entryRepo.MoveEntry(ctx, req.SourceWalletID, req.TargetWalletID, req.EntryID, userID, req.Notes)
	if err != nil {
		return nil, nil, err
	}

	meta, _ := json.Marshal(map[string]interface{}{
		"source_wallet_id": req.SourceWalletID,
		"target_wallet_id": req.TargetWalletID,
		"entry_id":         req.EntryID,
		"correction_id":    corrEntry.ID,
		"new_entry_id":     newEntry.ID,
		"notes":            req.Notes,
	})
	entityID := req.EntryID.String()
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &userID,
		Action:     string(model.AuditActionEntryMove),
		TargetType: "entry",
		TargetID:   &entityID,
		Metadata:   meta,
	})

	return corrEntry, newEntry, nil
}

func (s *entryService) GetEntry(ctx context.Context, entryID, userID uuid.UUID, userRole model.UserRole) (*model.Entry, error) {
	entry, err := s.entryRepo.GetByID(ctx, entryID)
	if err != nil {
		return nil, err
	}

	if userRole != model.RoleAdmin {
		authz, err := s.walletRepo.IsUserAuthorized(ctx, entry.WalletID, userID)
		if err != nil || !authz {
			return nil, ErrWalletPermissionDenied
		}
	}

	return entry, nil
}
