package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
)

type StatementService interface {
	GetStatement(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, filter repository.EntryFilter) (*model.StatementResponse, error)
	ExportCSV(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, filter repository.EntryFilter) ([]byte, error)
}

type statementService struct {
	entryRepo  repository.EntryRepository
	walletRepo repository.WalletRepository
}

func NewStatementService(
	entryRepo repository.EntryRepository,
	walletRepo repository.WalletRepository,
) StatementService {
	return &statementService{
		entryRepo:  entryRepo,
		walletRepo: walletRepo,
	}
}

func (s *statementService) GetStatement(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, filter repository.EntryFilter) (*model.StatementResponse, error) {
	if userRole != model.RoleAdmin {
		authz, err := s.walletRepo.IsUserAuthorized(ctx, walletID, userID)
		if err != nil {
			return nil, err
		}
		if !authz {
			return nil, ErrWalletPermissionDenied
		}
	}

	wallet, err := s.walletRepo.GetByIDWithDetails(ctx, walletID, &userID)
	if err != nil {
		return nil, err
	}

	summary, err := s.entryRepo.GetWalletSummary(ctx, walletID)
	if err != nil {
		return nil, err
	}

	filter.WalletID = walletID
	entries, total, err := s.entryRepo.ListByWallet(ctx, filter)
	if err != nil {
		return nil, err
	}

	page := 1
	if filter.Limit > 0 && filter.Offset > 0 {
		page = (filter.Offset / filter.Limit) + 1
	}

	return &model.StatementResponse{
		Wallet:   *wallet,
		Summary:  *summary,
		Entries:  entries,
		Total:    total,
		Page:     page,
		PageSize: filter.Limit,
	}, nil
}

func (s *statementService) ExportCSV(ctx context.Context, walletID, userID uuid.UUID, userRole model.UserRole, filter repository.EntryFilter) ([]byte, error) {
	// For export, fetch all matching entries without small limit
	filter.Limit = 10000
	filter.Offset = 0
	resp, err := s.GetStatement(ctx, walletID, userID, userRole, filter)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	// CSV Header
	header := []string{
		"ID",
		"Client ID",
		"Occurred At",
		"Created At",
		"Type",
		"Amount",
		"Running Balance",
		"Item Name",
		"Note",
		"Corrects Entry ID",
		"Correction Reason",
		"Created By",
	}
	if err := writer.Write(header); err != nil {
		return nil, err
	}

	// Rows
	for _, e := range resp.Entries {
		corrIDStr := ""
		if e.CorrectsEntryID != nil {
			corrIDStr = e.CorrectsEntryID.String()
		}

		row := []string{
			e.ID.String(),
			e.ClientID.String(),
			e.OccurredAt.Format(time.RFC3339),
			e.CreatedAt.Format(time.RFC3339),
			string(e.Type),
			fmt.Sprintf("%d", e.Amount),
			fmt.Sprintf("%d", e.RunningBalance),
			e.ItemName,
			e.Note,
			corrIDStr,
			e.CorrectionReason,
			e.CreatedByUsername,
		}
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}
