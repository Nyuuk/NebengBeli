package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/model"
)

var (
	ErrEntryNotFound            = errors.New("entry not found")
	ErrDuplicateClientID        = errors.New("duplicate client id")
	ErrCannotCorrectNonExisting = errors.New("referenced entry for correction does not exist")
	ErrEntryWalletMismatch      = errors.New("entry does not belong to specified wallet")
)

type EntryFilter struct {
	WalletID  uuid.UUID
	Type      *model.EntryType
	StartDate *time.Time
	EndDate   *time.Time
	Limit     int
	Offset    int
}

type EntryRepository interface {
	Create(ctx context.Context, entry *model.Entry) (*model.Entry, bool, error) // returns entry, isDuplicate, error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Entry, error)
	GetByClientID(ctx context.Context, clientID uuid.UUID) (*model.Entry, error)
	ListByWallet(ctx context.Context, filter EntryFilter) ([]model.Entry, int64, error)
	GetWalletSummary(ctx context.Context, walletID uuid.UUID) (*model.StatementSummary, error)
	MoveEntry(ctx context.Context, sourceWalletID, targetWalletID uuid.UUID, entryID uuid.UUID, createdBy uuid.UUID, notes string) (*model.Entry, *model.Entry, error)
	CountAll(ctx context.Context) (int64, int64, error) // count, total volume
}

type sqlEntryRepository struct {
	db *sql.DB
}

func NewEntryRepository(db *sql.DB) EntryRepository {
	return &sqlEntryRepository{db: db}
}

func (r *sqlEntryRepository) Create(ctx context.Context, entry *model.Entry) (*model.Entry, bool, error) {
	// First check if client ID already exists
	if entry.ClientID != uuid.Nil {
		existing, err := r.GetByClientID(ctx, entry.ClientID)
		if err == nil && existing != nil {
			return existing, true, nil
		}
	} else {
		entry.ClientID = uuid.New()
	}

	query := `
		INSERT INTO entries (
			client_id, wallet_id, type, amount, item_name, note,
			corrects_entry_id, correction_reason, occurred_at, created_by, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, created_at;
	`
	now := time.Now().UTC()
	if entry.OccurredAt.IsZero() {
		entry.OccurredAt = now
	}
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = now
	}

	err := r.db.QueryRowContext(ctx, query,
		entry.ClientID,
		entry.WalletID,
		entry.Type,
		entry.Amount,
		entry.ItemName,
		entry.Note,
		entry.CorrectsEntryID,
		entry.CorrectionReason,
		entry.OccurredAt,
		entry.CreatedBy,
		entry.CreatedAt,
	).Scan(&entry.ID, &entry.CreatedAt)

	if err != nil {
		if isDuplicateKeyError(err) {
			// Race condition: another thread inserted with same client_id
			existing, getErr := r.GetByClientID(ctx, entry.ClientID)
			if getErr == nil && existing != nil {
				return existing, true, nil
			}
			return nil, false, ErrDuplicateClientID
		}
		return nil, false, fmt.Errorf("failed to insert entry: %w", err)
	}

	return entry, false, nil
}

func (r *sqlEntryRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Entry, error) {
	query := `
		SELECT 
			e.id, e.client_id, e.wallet_id, e.type, e.amount, e.item_name, e.note,
			e.corrects_entry_id, e.correction_reason, e.occurred_at, e.created_by, e.created_at,
			u.username AS created_by_username
		FROM entries e
		JOIN users u ON e.created_by = u.id
		WHERE e.id = $1;
	`
	e := &model.Entry{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&e.ID,
		&e.ClientID,
		&e.WalletID,
		&e.Type,
		&e.Amount,
		&e.ItemName,
		&e.Note,
		&e.CorrectsEntryID,
		&e.CorrectionReason,
		&e.OccurredAt,
		&e.CreatedBy,
		&e.CreatedAt,
		&e.CreatedByUsername,
	)
	if err == sql.ErrNoRows {
		return nil, ErrEntryNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get entry by id: %w", err)
	}
	return e, nil
}

func (r *sqlEntryRepository) GetByClientID(ctx context.Context, clientID uuid.UUID) (*model.Entry, error) {
	query := `
		SELECT 
			e.id, e.client_id, e.wallet_id, e.type, e.amount, e.item_name, e.note,
			e.corrects_entry_id, e.correction_reason, e.occurred_at, e.created_by, e.created_at,
			u.username AS created_by_username
		FROM entries e
		JOIN users u ON e.created_by = u.id
		WHERE e.client_id = $1;
	`
	e := &model.Entry{}
	err := r.db.QueryRowContext(ctx, query, clientID).Scan(
		&e.ID,
		&e.ClientID,
		&e.WalletID,
		&e.Type,
		&e.Amount,
		&e.ItemName,
		&e.Note,
		&e.CorrectsEntryID,
		&e.CorrectionReason,
		&e.OccurredAt,
		&e.CreatedBy,
		&e.CreatedAt,
		&e.CreatedByUsername,
	)
	if err == sql.ErrNoRows {
		return nil, ErrEntryNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get entry by client id: %w", err)
	}
	return e, nil
}

func (r *sqlEntryRepository) ListByWallet(ctx context.Context, filter EntryFilter) ([]model.Entry, int64, error) {
	baseWhere := `WHERE e.wallet_id = $1`
	args := []interface{}{filter.WalletID}
	argIdx := 2

	if filter.Type != nil {
		baseWhere += fmt.Sprintf(" AND e.type = $%d", argIdx)
		args = append(args, *filter.Type)
		argIdx++
	}

	if filter.StartDate != nil {
		baseWhere += fmt.Sprintf(" AND e.occurred_at >= $%d", argIdx)
		args = append(args, *filter.StartDate)
		argIdx++
	}

	if filter.EndDate != nil {
		baseWhere += fmt.Sprintf(" AND e.occurred_at <= $%d", argIdx)
		args = append(args, *filter.EndDate)
		argIdx++
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM entries e %s;`, baseWhere)
	var total int64
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count wallet entries: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT 
			e.id, e.client_id, e.wallet_id, e.type, e.amount, e.item_name, e.note,
			e.corrects_entry_id, e.correction_reason, e.occurred_at, e.created_by, e.created_at,
			u.username AS created_by_username,
			SUM(e.amount) OVER (PARTITION BY e.wallet_id ORDER BY e.occurred_at ASC, e.created_at ASC, e.id ASC) AS running_balance
		FROM entries e
		JOIN users u ON e.created_by = u.id
		%s
		ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
		LIMIT $%d OFFSET $%d;
	`, baseWhere, argIdx, argIdx+1)

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit, filter.Offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list entries: %w", err)
	}
	defer rows.Close()

	var entries []model.Entry
	for rows.Next() {
		var e model.Entry
		if err := rows.Scan(
			&e.ID,
			&e.ClientID,
			&e.WalletID,
			&e.Type,
			&e.Amount,
			&e.ItemName,
			&e.Note,
			&e.CorrectsEntryID,
			&e.CorrectionReason,
			&e.OccurredAt,
			&e.CreatedBy,
			&e.CreatedAt,
			&e.CreatedByUsername,
			&e.RunningBalance,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan entry: %w", err)
		}
		entries = append(entries, e)
	}

	return entries, total, nil
}

func (r *sqlEntryRepository) GetWalletSummary(ctx context.Context, walletID uuid.UUID) (*model.StatementSummary, error) {
	query := `
		SELECT 
			COALESCE(SUM(CASE WHEN type = 'titipan' THEN amount ELSE 0 END), 0) AS total_titipan,
			COALESCE(SUM(CASE WHEN type = 'topup' THEN amount ELSE 0 END), 0) AS total_topup,
			COALESCE(SUM(CASE WHEN type = 'koreksi' THEN amount ELSE 0 END), 0) AS total_koreksi,
			COALESCE(SUM(amount), 0) AS current_balance,
			COUNT(id) AS entry_count
		FROM entries
		WHERE wallet_id = $1;
	`
	summary := &model.StatementSummary{}
	err := r.db.QueryRowContext(ctx, query, walletID).Scan(
		&summary.TotalTitipan,
		&summary.TotalTopup,
		&summary.TotalKoreksi,
		&summary.CurrentBalance,
		&summary.EntryCount,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get wallet summary: %w", err)
	}
	return summary, nil
}

func (r *sqlEntryRepository) MoveEntry(ctx context.Context, sourceWalletID, targetWalletID uuid.UUID, entryID uuid.UUID, createdBy uuid.UUID, notes string) (*model.Entry, *model.Entry, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to begin move transaction: %w", err)
	}
	defer tx.Rollback()

	// 1. Fetch source entry
	orig := &model.Entry{}
	err = tx.QueryRowContext(ctx, `
		SELECT id, wallet_id, type, amount, item_name, note, occurred_at
		FROM entries
		WHERE id = $1;
	`, entryID).Scan(&orig.ID, &orig.WalletID, &orig.Type, &orig.Amount, &orig.ItemName, &orig.Note, &orig.OccurredAt)
	if err == sql.ErrNoRows {
		return nil, nil, ErrEntryNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("failed to find source entry: %w", err)
	}

	if orig.WalletID != sourceWalletID {
		return nil, nil, ErrEntryWalletMismatch
	}

	now := time.Now().UTC()

	// 2. Insert koreksi in source wallet reversing the original amount
	correctionEntry := &model.Entry{
		ClientID:         uuid.New(),
		WalletID:         sourceWalletID,
		Type:             model.EntryTypeKoreksi,
		Amount:           -orig.Amount, // offset
		ItemName:         orig.ItemName,
		Note:             fmt.Sprintf("Pindah ke wallet tujuan. %s", notes),
		CorrectsEntryID:  &orig.ID,
		CorrectionReason: fmt.Sprintf("Pindah wallet: %s", notes),
		OccurredAt:       now,
		CreatedBy:        createdBy,
		CreatedAt:        now,
	}

	insertSQL := `
		INSERT INTO entries (
			client_id, wallet_id, type, amount, item_name, note,
			corrects_entry_id, correction_reason, occurred_at, created_by, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id;
	`
	if err := tx.QueryRowContext(ctx, insertSQL,
		correctionEntry.ClientID,
		correctionEntry.WalletID,
		correctionEntry.Type,
		correctionEntry.Amount,
		correctionEntry.ItemName,
		correctionEntry.Note,
		correctionEntry.CorrectsEntryID,
		correctionEntry.CorrectionReason,
		correctionEntry.OccurredAt,
		correctionEntry.CreatedBy,
		correctionEntry.CreatedAt,
	).Scan(&correctionEntry.ID); err != nil {
		return nil, nil, fmt.Errorf("failed to insert correction entry in source wallet: %w", err)
	}

	// 3. Insert target entry in destination wallet
	targetEntry := &model.Entry{
		ClientID:         uuid.New(),
		WalletID:         targetWalletID,
		Type:             orig.Type,
		Amount:           orig.Amount,
		ItemName:         orig.ItemName,
		Note:             fmt.Sprintf("Pindahan dari wallet asal. %s", notes),
		CorrectsEntryID:  nil,
		CorrectionReason: "",
		OccurredAt:       orig.OccurredAt,
		CreatedBy:        createdBy,
		CreatedAt:        now,
	}

	if err := tx.QueryRowContext(ctx, insertSQL,
		targetEntry.ClientID,
		targetEntry.WalletID,
		targetEntry.Type,
		targetEntry.Amount,
		targetEntry.ItemName,
		targetEntry.Note,
		targetEntry.CorrectsEntryID,
		targetEntry.CorrectionReason,
		targetEntry.OccurredAt,
		targetEntry.CreatedBy,
		targetEntry.CreatedAt,
	).Scan(&targetEntry.ID); err != nil {
		return nil, nil, fmt.Errorf("failed to insert moved entry into target wallet: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, nil, fmt.Errorf("failed to commit move transaction: %w", err)
	}

	return correctionEntry, targetEntry, nil
}

func (r *sqlEntryRepository) CountAll(ctx context.Context) (int64, int64, error) {
	var count, volume int64
	err := r.db.QueryRowContext(ctx, `
		SELECT 
			COUNT(*),
			COALESCE(SUM(ABS(amount)), 0)
		FROM entries;
	`).Scan(&count, &volume)
	return count, volume, err
}
