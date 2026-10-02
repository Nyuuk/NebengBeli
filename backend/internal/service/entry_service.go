package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	ErrCannotCorrectCorrection  = errors.New("cannot correct an entry of type koreksi")
	ErrCorrectionReasonRequired = errors.New("correction_reason is required and must be a valid PRD reason (salah harga, batal, salah dompet, or lainnya)")
	ErrCorrectionNoDelta        = errors.New("target nominal is equal to current effective amount; delta is zero")
	ErrDestinationArchived      = errors.New("destination wallet is archived")
)

type CreateEntryRequest struct {
	ClientID         *uuid.UUID      `json:"client_id,omitempty"`
	WalletID         uuid.UUID       `json:"wallet_id"`
	Type             model.EntryType `json:"type"`
	Amount           int64           `json:"amount"`                  // Nominal for titipan/topup, or target final nominal for koreksi
	TargetAmount     *int64          `json:"target_amount,omitempty"` // Explicit target final nominal for koreksi
	FinalNominal     *int64          `json:"final_nominal,omitempty"` // Alias for target final nominal
	ItemName         string          `json:"item_name"`
	Note             string          `json:"note"`
	CorrectsEntryID  *uuid.UUID      `json:"corrects_entry_id,omitempty"`
	CorrectionReason string          `json:"correction_reason,omitempty"`
	OccurredAt       *time.Time      `json:"occurred_at,omitempty"`
}

type MoveEntryRequest struct {
	ClientID           *uuid.UUID `json:"client_id,omitempty"`
	CorrectionClientID *uuid.UUID `json:"correction_client_id,omitempty"`
	TargetClientID     *uuid.UUID `json:"target_client_id,omitempty"`
	SourceWalletID     uuid.UUID  `json:"source_wallet_id"`
	TargetWalletID     uuid.UUID  `json:"target_wallet_id"`
	EntryID            uuid.UUID  `json:"entry_id"`
	Notes              string     `json:"notes"`
}

type EntryService interface {
	CreateEntry(ctx context.Context, userID uuid.UUID, userRole model.UserRole, req CreateEntryRequest) (*model.Entry, bool, error)
	CreateBatchEntries(ctx context.Context, userID uuid.UUID, userRole model.UserRole, req model.BatchEntriesRequest) (*model.BatchEntriesResponse, error)
	MoveEntry(ctx context.Context, userID uuid.UUID, userRole model.UserRole, req MoveEntryRequest) (*model.Entry, *model.Entry, error)
	GetEntry(ctx context.Context, entryID, userID uuid.UUID, userRole model.UserRole) (*model.Entry, error)
	GetItemSuggestions(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, query string, limit int) ([]model.ItemSuggestion, error)
	GetEntryCorrections(ctx context.Context, entryID, userID uuid.UUID, userRole model.UserRole) ([]model.Entry, error)
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

	// 1. Authorization and active status check: Only the wallet creator can record financial ledger entries
	wallet, err := s.walletRepo.GetByID(ctx, req.WalletID)
	if err != nil {
		return nil, false, err
	}
	if wallet.CreatorID != userID {
		return nil, false, ErrWalletPermissionDenied
	}
	if wallet.ArchivedAt != nil {
		return nil, false, ErrArchivedWallet
	}

	var signedAmount int64
	itemName := req.ItemName
	note := req.Note

	switch req.Type {
	case model.EntryTypeTitipan:
		if req.Amount == 0 {
			return nil, false, ErrZeroAmount
		}
		if itemName == "" {
			return nil, false, ErrItemNameRequired
		}
		// Titipan is a debit against the owner: negative (PRD: "Titipan | Debit (−)")
		if req.Amount < 0 {
			signedAmount = req.Amount
		} else {
			signedAmount = -req.Amount
		}

	case model.EntryTypeTopup:
		if req.Amount == 0 {
			return nil, false, ErrZeroAmount
		}
		if itemName == "" {
			itemName = "Top-up"
		}
		// Topup is a credit against the owner: positive (PRD: "Top-up | Kredit (+)")
		if req.Amount > 0 {
			signedAmount = req.Amount
		} else {
			signedAmount = -req.Amount
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
			return nil, false, ErrCannotCorrectCorrection
		}

		// Validate correction reason against PRD requirements
		if !IsValidCorrectionReason(req.CorrectionReason) {
			return nil, false, ErrCorrectionReasonRequired
		}

		// Auto-populate item_name and note from referenced entry if omitted
		if itemName == "" {
			itemName = refEntry.ItemName
		}
		if note == "" {
			note = fmt.Sprintf("Koreksi: %s", req.CorrectionReason)
		}

		// Determine target final nominal (nominal yang benar)
		var targetNominal int64
		if req.TargetAmount != nil {
			targetNominal = *req.TargetAmount
		} else if req.FinalNominal != nil {
			targetNominal = *req.FinalNominal
		} else {
			targetNominal = req.Amount
		}

		// Target nominal is non-negative
		if targetNominal < 0 {
			targetNominal = -targetNominal
		}

		// Current effective signed amount of original entry (asli + prior corrections)
		currentEffective := refEntry.EffectiveAmount

		// Target signed amount based on referenced entry type
		var targetSigned int64
		switch refEntry.Type {
		case model.EntryTypeTitipan:
			// Titipan is -signed
			if targetNominal == 0 {
				targetSigned = 0
			} else {
				targetSigned = -targetNominal
			}
		case model.EntryTypeTopup:
			// Topup is +signed
			targetSigned = targetNominal
		}

		// Server-side delta calculation
		delta := targetSigned - currentEffective
		if delta == 0 {
			return nil, false, ErrCorrectionNoDelta
		}

		signedAmount = delta

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
		ItemName:         itemName,
		Note:             note,
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
			"item_name": itemName,
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

	// 1. Authorization checks: Creator must own both source and target wallets
	srcWallet, err := s.walletRepo.GetByID(ctx, req.SourceWalletID)
	if err != nil {
		return nil, nil, err
	}
	if srcWallet.CreatorID != userID {
		return nil, nil, ErrWalletPermissionDenied
	}

	dstWallet, err := s.walletRepo.GetByID(ctx, req.TargetWalletID)
	if err != nil {
		return nil, nil, err
	}
	if dstWallet.CreatorID != userID {
		return nil, nil, ErrWalletPermissionDenied
	}
	if dstWallet.ArchivedAt != nil {
		return nil, nil, ErrDestinationArchived
	}

	// Derive client IDs if single client_id was passed
	corrCID := req.CorrectionClientID
	tgtCID := req.TargetClientID
	if corrCID == nil && req.ClientID != nil && *req.ClientID != uuid.Nil {
		corrCID = req.ClientID
	}
	if tgtCID == nil && req.ClientID != nil && *req.ClientID != uuid.Nil {
		// Use distinct deterministic UUID for target if base client_id is given
		derived := uuid.NewSHA1(*req.ClientID, []byte("target-entry"))
		tgtCID = &derived
	}

	corrEntry, newEntry, err := s.entryRepo.MoveEntry(ctx, req.SourceWalletID, req.TargetWalletID, req.EntryID, userID, req.Notes, corrCID, tgtCID)
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

func (s *entryService) CreateBatchEntries(ctx context.Context, userID uuid.UUID, userRole model.UserRole, req model.BatchEntriesRequest) (*model.BatchEntriesResponse, error) {
	if len(req.Entries) == 0 {
		return nil, errors.New("at least one entry is required in batch")
	}

	defaultOccurredAt := time.Now().UTC()
	if req.OccurredAt != nil && !req.OccurredAt.IsZero() {
		defaultOccurredAt = req.OccurredAt.UTC()
	}

	// Cache wallets to avoid duplicate DB calls
	walletsCache := make(map[uuid.UUID]*model.Wallet)
	entriesToInsert := make([]model.Entry, 0, len(req.Entries))
	var totalAmount int64

	for i, item := range req.Entries {
		if item.WalletID == uuid.Nil {
			return nil, fmt.Errorf("entry at row %d missing wallet_id", i+1)
		}
		if item.ItemName == "" {
			return nil, fmt.Errorf("entry at row %d missing item_name", i+1)
		}
		if item.Amount == 0 {
			return nil, fmt.Errorf("entry at row %d amount cannot be zero", i+1)
		}

		wallet, ok := walletsCache[item.WalletID]
		if !ok {
			var err error
			wallet, err = s.walletRepo.GetByID(ctx, item.WalletID)
			if err != nil {
				return nil, fmt.Errorf("entry at row %d: invalid wallet (%w)", i+1, err)
			}
			walletsCache[item.WalletID] = wallet
		}

		// Verify creator and active status
		if wallet.CreatorID != userID {
			return nil, fmt.Errorf("entry at row %d: %w", i+1, ErrWalletPermissionDenied)
		}
		if wallet.ArchivedAt != nil {
			return nil, fmt.Errorf("entry at row %d: %w", i+1, ErrArchivedWallet)
		}

		entryType := item.Type
		if entryType == "" {
			entryType = model.EntryTypeTitipan
		}

		var signedAmount int64
		switch entryType {
		case model.EntryTypeTitipan:
			// Titipan is -signed (PRD: "Titipan | Debit (−)")
			if item.Amount < 0 {
				signedAmount = item.Amount
			} else {
				signedAmount = -item.Amount
			}
		case model.EntryTypeTopup:
			// Topup is +signed (PRD: "Top-up | Kredit (+)")
			if item.Amount > 0 {
				signedAmount = item.Amount
			} else {
				signedAmount = -item.Amount
			}
		case model.EntryTypeKoreksi:
			signedAmount = item.Amount
		default:
			return nil, fmt.Errorf("entry at row %d: %w", i+1, ErrInvalidEntryType)
		}

		var clientID uuid.UUID
		if item.ClientID != nil && *item.ClientID != uuid.Nil {
			clientID = *item.ClientID
		} else {
			clientID = uuid.New()
		}

		occurredAt := defaultOccurredAt
		if item.OccurredAt != nil && !item.OccurredAt.IsZero() {
			occurredAt = item.OccurredAt.UTC()
		}

		entriesToInsert = append(entriesToInsert, model.Entry{
			ClientID:   clientID,
			WalletID:   item.WalletID,
			Type:       entryType,
			Amount:     signedAmount,
			ItemName:   item.ItemName,
			Note:       item.Note,
			OccurredAt: occurredAt,
			CreatedBy:  userID,
		})

		totalAmount += signedAmount
	}

	created, err := s.entryRepo.CreateBatch(ctx, entriesToInsert)
	if err != nil {
		return nil, err
	}

	// Audit log for batch creation
	meta, _ := json.Marshal(map[string]interface{}{
		"count":        len(created),
		"total_amount": totalAmount,
	})
	_ = s.auditRepo.Create(ctx, &model.AuditLog{
		ActorID:    &userID,
		Action:     string(model.AuditActionEntryBatchCreate),
		TargetType: "entry_batch",
		Metadata:   meta,
	})

	return &model.BatchEntriesResponse{
		Message:     "batch entries created successfully",
		Count:       len(created),
		TotalAmount: totalAmount,
		Entries:     created,
	}, nil
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

func (s *entryService) GetItemSuggestions(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, query string, limit int) ([]model.ItemSuggestion, error) {
	if userRole != model.RoleAdmin {
		authz, err := s.walletRepo.IsUserAuthorized(ctx, walletID, userID)
		if err != nil || !authz {
			return nil, ErrWalletPermissionDenied
		}
	}

	return s.entryRepo.GetItemSuggestions(ctx, walletID, query, limit)
}

func (s *entryService) GetEntryCorrections(ctx context.Context, entryID, userID uuid.UUID, userRole model.UserRole) ([]model.Entry, error) {
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

	return s.entryRepo.GetCorrectionsByEntryID(ctx, entryID)
}
