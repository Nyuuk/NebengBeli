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

type AdminEntryFilter struct {
	WalletID  *uuid.UUID
	CreatorID *uuid.UUID
	Type      *model.EntryType
	StartDate *time.Time
	EndDate   *time.Time
	Limit     int
	Offset    int
}

type EntryRepository interface {
	Create(ctx context.Context, entry *model.Entry) (*model.Entry, bool, error) // returns entry, isDuplicate, error
	CreateBatch(ctx context.Context, entries []model.Entry) ([]model.Entry, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.Entry, error)
	GetByClientID(ctx context.Context, clientID uuid.UUID) (*model.Entry, error)
	GetCorrectionsByEntryID(ctx context.Context, entryID uuid.UUID) ([]model.Entry, error)
	GetItemSuggestions(ctx context.Context, walletID uuid.UUID, query string, limit int) ([]model.ItemSuggestion, error)
	GetTrendsByCreator(ctx context.Context, creatorID uuid.UUID) (*model.InsightTrends, error)
	GetAdminTrends(ctx context.Context) (*model.InsightTrends, error)
	ListByWallet(ctx context.Context, filter EntryFilter) ([]model.Entry, int64, error)
	ListAdminEntries(ctx context.Context, filter AdminEntryFilter) ([]model.Entry, int64, *model.AdminPeriodSummary, error)
	GetWalletSummary(ctx context.Context, walletID uuid.UUID) (*model.StatementSummary, error)
	GetWalletSummaryWithFilter(ctx context.Context, walletID uuid.UUID, startDate, endDate *time.Time) (*model.StatementSummary, error)
	GetAdminCreators(ctx context.Context) ([]model.AdminCreatorDetail, error)
	MoveEntry(ctx context.Context, sourceWalletID, targetWalletID uuid.UUID, entryID uuid.UUID, createdBy uuid.UUID, notes string, correctionClientID, targetClientID *uuid.UUID) (*model.Entry, *model.Entry, error)
	CountAll(ctx context.Context) (int64, int64, error) // count, total volume
	GetAdminStatsBreakdown(ctx context.Context) (map[string]map[string]int64, error)
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
			u.username AS created_by_username,
			e.amount + COALESCE((SELECT SUM(c.amount) FROM entries c WHERE c.corrects_entry_id = e.id), 0) AS effective_amount
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
		&e.EffectiveAmount,
	)
	if err == sql.ErrNoRows {
		return nil, ErrEntryNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get entry by id: %w", err)
	}

	// Fetch child corrections if any
	corrections, _ := r.GetCorrectionsByEntryID(ctx, e.ID)
	if corrections == nil {
		corrections = make([]model.Entry, 0)
	}
	e.Corrections = corrections

	return e, nil
}

func (r *sqlEntryRepository) GetByClientID(ctx context.Context, clientID uuid.UUID) (*model.Entry, error) {
	query := `
		SELECT
			e.id, e.client_id, e.wallet_id, e.type, e.amount, e.item_name, e.note,
			e.corrects_entry_id, e.correction_reason, e.occurred_at, e.created_by, e.created_at,
			u.username AS created_by_username,
			e.amount + COALESCE((SELECT SUM(c.amount) FROM entries c WHERE c.corrects_entry_id = e.id), 0) AS effective_amount
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
		&e.EffectiveAmount,
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
			SUM(e.amount) OVER (PARTITION BY e.wallet_id ORDER BY e.occurred_at ASC, e.created_at ASC, e.id ASC) AS running_balance,
			e.amount + COALESCE((SELECT SUM(c.amount) FROM entries c WHERE c.corrects_entry_id = e.id), 0) AS effective_amount
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

	entries := make([]model.Entry, 0)
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
			&e.EffectiveAmount,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan entry: %w", err)
		}
		entries = append(entries, e)
	}

	return entries, total, nil
}

func (r *sqlEntryRepository) ListAdminEntries(ctx context.Context, filter AdminEntryFilter) ([]model.Entry, int64, *model.AdminPeriodSummary, error) {
	baseWhere := `WHERE 1=1`
	args := make([]interface{}, 0)
	argIdx := 1

	if filter.WalletID != nil {
		baseWhere += fmt.Sprintf(" AND e.wallet_id = $%d", argIdx)
		args = append(args, *filter.WalletID)
		argIdx++
	}

	if filter.CreatorID != nil {
		baseWhere += fmt.Sprintf(" AND (w.creator_id = $%d OR e.created_by = $%d)", argIdx, argIdx)
		args = append(args, *filter.CreatorID)
		argIdx++
	}

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

	// Calculate summary and count in one query
	summaryQuery := fmt.Sprintf(`
		SELECT
			COUNT(e.id) AS total_count,
			COALESCE(SUM(CASE WHEN e.type = 'titipan' THEN 1 ELSE 0 END), 0) AS total_titipan_count,
			COALESCE(SUM(CASE WHEN e.type = 'titipan' THEN e.amount ELSE 0 END), 0) AS total_titipan_amount,
			COALESCE(SUM(CASE WHEN e.type = 'topup' THEN 1 ELSE 0 END), 0) AS total_topup_count,
			COALESCE(SUM(CASE WHEN e.type = 'topup' THEN e.amount ELSE 0 END), 0) AS total_topup_amount,
			COALESCE(SUM(CASE WHEN e.type = 'koreksi' THEN 1 ELSE 0 END), 0) AS total_koreksi_count,
			COALESCE(SUM(CASE WHEN e.type = 'koreksi' THEN e.amount ELSE 0 END), 0) AS total_koreksi_amount,
			COALESCE(SUM(ABS(e.amount)), 0) AS total_volume,
			COALESCE(SUM(e.amount), 0) AS net_balance
		FROM entries e
		JOIN wallets w ON e.wallet_id = w.id
		%s;
	`, baseWhere)

	summary := &model.AdminPeriodSummary{}
	var totalCount int64
	if err := r.db.QueryRowContext(ctx, summaryQuery, args...).Scan(
		&totalCount,
		&summary.TotalTitipanCount,
		&summary.TotalTitipanAmount,
		&summary.TotalTopupCount,
		&summary.TotalTopupAmount,
		&summary.TotalKoreksiCount,
		&summary.TotalKoreksiAmount,
		&summary.TotalVolume,
		&summary.NetBalance,
	); err != nil {
		return nil, 0, nil, fmt.Errorf("failed to get admin entries summary: %w", err)
	}
	summary.TotalCount = totalCount

	query := fmt.Sprintf(`
		SELECT
			e.id, e.client_id, e.wallet_id, e.type, e.amount, e.item_name, e.note,
			e.corrects_entry_id, e.correction_reason, e.occurred_at, e.created_by, e.created_at,
			u.username AS created_by_username,
			w.name AS wallet_name,
			wcu.username AS wallet_creator_username,
			COALESCE(wou.username, '') AS wallet_owner_username,
			e.amount + COALESCE((SELECT SUM(c.amount) FROM entries c WHERE c.corrects_entry_id = e.id), 0) AS effective_amount
		FROM entries e
		JOIN users u ON e.created_by = u.id
		JOIN wallets w ON e.wallet_id = w.id
		JOIN users wcu ON w.creator_id = wcu.id
		LEFT JOIN users wou ON w.owner_id = wou.id
		%s
		ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
		LIMIT $%d OFFSET $%d;
	`, baseWhere, argIdx, argIdx+1)

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	queryArgs := append(args, limit, filter.Offset)

	rows, err := r.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("failed to list admin entries: %w", err)
	}
	defer rows.Close()

	entries := make([]model.Entry, 0)
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
			&e.WalletName,
			&e.WalletCreatorUsername,
			&e.WalletOwnerUsername,
			&e.EffectiveAmount,
		); err != nil {
			return nil, 0, nil, fmt.Errorf("failed to scan admin entry: %w", err)
		}
		entries = append(entries, e)
	}

	return entries, totalCount, summary, nil
}

func (r *sqlEntryRepository) GetWalletSummary(ctx context.Context, walletID uuid.UUID) (*model.StatementSummary, error) {
	return r.GetWalletSummaryWithFilter(ctx, walletID, nil, nil)
}

func (r *sqlEntryRepository) GetWalletSummaryWithFilter(ctx context.Context, walletID uuid.UUID, startDate, endDate *time.Time) (*model.StatementSummary, error) {
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

	if startDate != nil {
		var startingBalance int64
		_ = r.db.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(amount), 0)
			FROM entries
			WHERE wallet_id = $1 AND occurred_at < $2;
		`, walletID, *startDate).Scan(&startingBalance)
		summary.StartingBalance = startingBalance

		var periodTotal int64
		var periodQuery string
		var periodArgs []interface{}
		if endDate != nil {
			periodQuery = `SELECT COALESCE(SUM(amount), 0) FROM entries WHERE wallet_id = $1 AND occurred_at >= $2 AND occurred_at <= $3;`
			periodArgs = []interface{}{walletID, *startDate, *endDate}
		} else {
			periodQuery = `SELECT COALESCE(SUM(amount), 0) FROM entries WHERE wallet_id = $1 AND occurred_at >= $2;`
			periodArgs = []interface{}{walletID, *startDate}
		}
		_ = r.db.QueryRowContext(ctx, periodQuery, periodArgs...).Scan(&periodTotal)
		summary.PeriodTotal = periodTotal
		summary.EndingBalance = startingBalance + periodTotal
	} else {
		summary.StartingBalance = 0
		summary.EndingBalance = summary.CurrentBalance
		summary.PeriodTotal = summary.CurrentBalance
	}

	return summary, nil
}

func (r *sqlEntryRepository) MoveEntry(ctx context.Context, sourceWalletID, targetWalletID uuid.UUID, entryID uuid.UUID, createdBy uuid.UUID, notes string, correctionClientID, targetClientID *uuid.UUID) (*model.Entry, *model.Entry, error) {
	// 1. Check idempotency if client_id is provided
	var corrCID, tgtCID uuid.UUID
	if correctionClientID != nil && *correctionClientID != uuid.Nil {
		corrCID = *correctionClientID
	} else {
		corrCID = uuid.New()
	}

	if targetClientID != nil && *targetClientID != uuid.Nil {
		tgtCID = *targetClientID
	} else {
		tgtCID = uuid.New()
	}

	existingCorr, err := r.GetByClientID(ctx, corrCID)
	if err == nil && existingCorr != nil {
		existingTgt, tgtErr := r.GetByClientID(ctx, tgtCID)
		if tgtErr == nil && existingTgt != nil {
			return existingCorr, existingTgt, nil
		}
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to begin move transaction: %w", err)
	}
	defer tx.Rollback()

	// 2. Fetch source entry with effective amount
	orig := &model.Entry{}
	err = tx.QueryRowContext(ctx, `
		SELECT
			e.id, e.wallet_id, e.type, e.amount, e.item_name, e.note, e.occurred_at,
			e.amount + COALESCE((SELECT SUM(c.amount) FROM entries c WHERE c.corrects_entry_id = e.id), 0) AS effective_amount
		FROM entries e
		WHERE e.id = $1;
	`, entryID).Scan(&orig.ID, &orig.WalletID, &orig.Type, &orig.Amount, &orig.ItemName, &orig.Note, &orig.OccurredAt, &orig.EffectiveAmount)
	if err == sql.ErrNoRows {
		return nil, nil, ErrEntryNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("failed to find source entry: %w", err)
	}

	if orig.WalletID != sourceWalletID {
		return nil, nil, ErrEntryWalletMismatch
	}

	if orig.Type == model.EntryTypeKoreksi {
		return nil, nil, errors.New("cannot move an entry of type koreksi")
	}

	if orig.Type != model.EntryTypeTitipan {
		return nil, nil, errors.New("only titipan entries can be moved to another wallet")
	}

	effectiveValue := orig.EffectiveAmount
	if effectiveValue == 0 {
		return nil, nil, errors.New("cannot move an entry with effective amount of zero")
	}

	now := time.Now().UTC()

	// 3. Insert koreksi in source wallet reversing the full effective amount to zero
	correctionEntry := &model.Entry{
		ClientID:         corrCID,
		WalletID:         sourceWalletID,
		Type:             model.EntryTypeKoreksi,
		Amount:           -effectiveValue, // Reverses effective amount
		ItemName:         orig.ItemName,
		Note:             fmt.Sprintf("Pindah ke dompet lain. %s", notes),
		CorrectsEntryID:  &orig.ID,
		CorrectionReason: "salah dompet",
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

	// 4. Insert new target entry in destination wallet with the preserved effective value
	targetEntry := &model.Entry{
		ClientID:         tgtCID,
		WalletID:         targetWalletID,
		Type:             orig.Type,
		Amount:           effectiveValue,
		ItemName:         orig.ItemName,
		Note:             fmt.Sprintf("Pindahan dari dompet asal. %s", notes),
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

func (r *sqlEntryRepository) GetAdminStatsBreakdown(ctx context.Context) (map[string]map[string]int64, error) {
	query := `
		SELECT
			type,
			COUNT(id) AS count,
			COALESCE(SUM(amount), 0) AS total_amount,
			COALESCE(SUM(ABS(amount)), 0) AS total_volume
		FROM entries
		GROUP BY type;
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get admin stats breakdown: %w", err)
	}
	defer rows.Close()

	result := make(map[string]map[string]int64)
	for rows.Next() {
		var entryType string
		var count, totalAmount, totalVolume int64
		if err := rows.Scan(&entryType, &count, &totalAmount, &totalVolume); err != nil {
			return nil, err
		}
		result[entryType] = map[string]int64{
			"count":        count,
			"total_amount": totalAmount,
			"total_volume": totalVolume,
		}
	}
	return result, nil
}

func (r *sqlEntryRepository) CreateBatch(ctx context.Context, entries []model.Entry) ([]model.Entry, error) {
	if len(entries) == 0 {
		return []model.Entry{}, nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin batch transaction: %w", err)
	}
	defer tx.Rollback()

	createdEntries := make([]model.Entry, 0, len(entries))
	now := time.Now().UTC()

	insertSQL := `
		INSERT INTO entries (
			client_id, wallet_id, type, amount, item_name, note,
			corrects_entry_id, correction_reason, occurred_at, created_by, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, created_at;
	`

	for i := range entries {
		e := entries[i]
		if e.ClientID == uuid.Nil {
			e.ClientID = uuid.New()
		}
		if e.OccurredAt.IsZero() {
			e.OccurredAt = now
		}
		if e.CreatedAt.IsZero() {
			e.CreatedAt = now
		}

		err := tx.QueryRowContext(ctx, insertSQL,
			e.ClientID,
			e.WalletID,
			e.Type,
			e.Amount,
			e.ItemName,
			e.Note,
			e.CorrectsEntryID,
			e.CorrectionReason,
			e.OccurredAt,
			e.CreatedBy,
			e.CreatedAt,
		).Scan(&e.ID, &e.CreatedAt)

		if err != nil {
			return nil, fmt.Errorf("failed to insert batch entry (index %d, item '%s'): %w", i, e.ItemName, err)
		}

		createdEntries = append(createdEntries, e)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit batch transaction: %w", err)
	}

	return createdEntries, nil
}

func (r *sqlEntryRepository) GetItemSuggestions(ctx context.Context, walletID uuid.UUID, query string, limit int) ([]model.ItemSuggestion, error) {
	if limit <= 0 {
		limit = 20
	}
	sqlQuery := `
		WITH ranked AS (
			SELECT
				item_name,
				amount,
				occurred_at,
				ROW_NUMBER() OVER (PARTITION BY item_name ORDER BY occurred_at DESC, created_at DESC, id DESC) as rn,
				COUNT(*) OVER (PARTITION BY item_name) as freq,
				MAX(occurred_at) OVER (PARTITION BY item_name) as last_occ
			FROM entries
			WHERE wallet_id = $1 AND type = 'titipan'
			  AND ($2 = '' OR item_name ILIKE '%' || $2 || '%')
		)
		SELECT item_name, amount AS last_price, freq AS frequency, last_occ AS last_occurred_at
		FROM ranked
		WHERE rn = 1
		ORDER BY freq DESC, last_occurred_at DESC, item_name ASC
		LIMIT $3;
	`
	rows, err := r.db.QueryContext(ctx, sqlQuery, walletID, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get item suggestions: %w", err)
	}
	defer rows.Close()

	results := make([]model.ItemSuggestion, 0)
	for rows.Next() {
		var s model.ItemSuggestion
		if err := rows.Scan(&s.ItemName, &s.LastPrice, &s.Frequency, &s.LastOccurredAt); err != nil {
			return nil, fmt.Errorf("failed to scan item suggestion: %w", err)
		}
		results = append(results, s)
	}
	return results, nil
}

func (r *sqlEntryRepository) GetCorrectionsByEntryID(ctx context.Context, entryID uuid.UUID) ([]model.Entry, error) {
	query := `
		SELECT
		e.id, e.client_id, e.wallet_id, e.type, e.amount, e.item_name, e.note,
		e.corrects_entry_id, e.correction_reason, e.occurred_at, e.created_by, e.created_at,
		u.username AS created_by_username
		FROM entries e
		JOIN users u ON e.created_by = u.id
		WHERE e.corrects_entry_id = $1
		ORDER BY e.occurred_at ASC, e.created_at ASC, e.id ASC;
	`
	rows, err := r.db.QueryContext(ctx, query, entryID)
	if err != nil {
		return nil, fmt.Errorf("failed to get corrections for entry: %w", err)
	}
	defer rows.Close()

	corrections := make([]model.Entry, 0)
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
		); err != nil {
			return nil, fmt.Errorf("failed to scan correction entry: %w", err)
		}
		corrections = append(corrections, e)
	}
	return corrections, nil
}

func (r *sqlEntryRepository) GetTrendsByCreator(ctx context.Context, creatorID uuid.UUID) (*model.InsightTrends, error) {
	trends := &model.InsightTrends{
		Daily:   make([]model.TrendPoint, 0),
		Weekly:  make([]model.TrendPoint, 0),
		Monthly: make([]model.TrendPoint, 0),
	}

	// 1. Daily trends (past 30 days in Asia/Jakarta)
	dailyQuery := `
	SELECT
			TO_CHAR(e.occurred_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day_label,
			COUNT(e.id) AS count,
			COALESCE(SUM(e.amount), 0) AS total_amount
		FROM entries e
		JOIN wallets w ON e.wallet_id = w.id
		WHERE w.creator_id = $1
		  AND e.type = 'titipan'
		  AND e.occurred_at >= NOW() - INTERVAL '30 days'
		GROUP BY 1
		ORDER BY 1 ASC;
	`
	rows, err := r.db.QueryContext(ctx, dailyQuery, creatorID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var pt model.TrendPoint
			if err := rows.Scan(&pt.Label, &pt.Count, &pt.TotalAmount); err == nil {
				trends.Daily = append(trends.Daily, pt)
			}
		}
	}

	// 2. Weekly trends (past 12 weeks in Asia/Jakarta)
	weeklyQuery := `
	SELECT
			TO_CHAR(DATE_TRUNC('week', e.occurred_at AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS week_label,
			COUNT(e.id) AS count,
			COALESCE(SUM(e.amount), 0) AS total_amount
		FROM entries e
		JOIN wallets w ON e.wallet_id = w.id
		WHERE w.creator_id = $1
		  AND e.type = 'titipan'
		  AND e.occurred_at >= NOW() - INTERVAL '12 weeks'
		GROUP BY 1
		ORDER BY 1 ASC;
	`
	wRows, err := r.db.QueryContext(ctx, weeklyQuery, creatorID)
	if err == nil {
		defer wRows.Close()
		for wRows.Next() {
			var pt model.TrendPoint
			if err := wRows.Scan(&pt.Label, &pt.Count, &pt.TotalAmount); err == nil {
				trends.Weekly = append(trends.Weekly, pt)
			}
		}
	}

	// 3. Monthly trends (past 12 months in Asia/Jakarta)
	monthlyQuery := `
	SELECT
			TO_CHAR(e.occurred_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS month_label,
			COUNT(e.id) AS count,
			COALESCE(SUM(e.amount), 0) AS total_amount
		FROM entries e
		JOIN wallets w ON e.wallet_id = w.id
		WHERE w.creator_id = $1
		  AND e.type = 'titipan'
		  AND e.occurred_at >= NOW() - INTERVAL '12 months'
		GROUP BY 1
		ORDER BY 1 ASC;
	`
	mRows, err := r.db.QueryContext(ctx, monthlyQuery, creatorID)
	if err == nil {
		defer mRows.Close()
		for mRows.Next() {
			var pt model.TrendPoint
			if err := mRows.Scan(&pt.Label, &pt.Count, &pt.TotalAmount); err == nil {
				trends.Monthly = append(trends.Monthly, pt)
			}
		}
	}

	return trends, nil
}

func (r *sqlEntryRepository) GetAdminTrends(ctx context.Context) (*model.InsightTrends, error) {
	trends := &model.InsightTrends{
		Daily:   make([]model.TrendPoint, 0),
		Weekly:  make([]model.TrendPoint, 0),
		Monthly: make([]model.TrendPoint, 0),
	}

	// 1. Daily trends system-wide (past 30 days in Asia/Jakarta)
	dailyQuery := `
		SELECT
			TO_CHAR(e.occurred_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day_label,
			COUNT(e.id) AS count,
			COALESCE(SUM(e.amount), 0) AS total_amount
		FROM entries e
		WHERE e.type = 'titipan'
		  AND e.occurred_at >= NOW() - INTERVAL '30 days'
		GROUP BY 1
		ORDER BY 1 ASC;
	`
	rows, err := r.db.QueryContext(ctx, dailyQuery)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var pt model.TrendPoint
			if err := rows.Scan(&pt.Label, &pt.Count, &pt.TotalAmount); err == nil {
				trends.Daily = append(trends.Daily, pt)
			}
		}
	}

	// 2. Weekly trends system-wide (past 12 weeks in Asia/Jakarta)
	weeklyQuery := `
		SELECT
			TO_CHAR(DATE_TRUNC('week', e.occurred_at AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS week_label,
			COUNT(e.id) AS count,
			COALESCE(SUM(e.amount), 0) AS total_amount
		FROM entries e
		WHERE e.type = 'titipan'
		  AND e.occurred_at >= NOW() - INTERVAL '12 weeks'
		GROUP BY 1
		ORDER BY 1 ASC;
	`
	wRows, err := r.db.QueryContext(ctx, weeklyQuery)
	if err == nil {
		defer wRows.Close()
		for wRows.Next() {
			var pt model.TrendPoint
			if err := wRows.Scan(&pt.Label, &pt.Count, &pt.TotalAmount); err == nil {
				trends.Weekly = append(trends.Weekly, pt)
			}
		}
	}

	// 3. Monthly trends system-wide (past 12 months in Asia/Jakarta)
	monthlyQuery := `
		SELECT
			TO_CHAR(e.occurred_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS month_label,
			COUNT(e.id) AS count,
			COALESCE(SUM(e.amount), 0) AS total_amount
		FROM entries e
		WHERE e.type = 'titipan'
		  AND e.occurred_at >= NOW() - INTERVAL '12 months'
		GROUP BY 1
		ORDER BY 1 ASC;
	`
	mRows, err := r.db.QueryContext(ctx, monthlyQuery)
	if err == nil {
		defer mRows.Close()
		for mRows.Next() {
			var pt model.TrendPoint
			if err := mRows.Scan(&pt.Label, &pt.Count, &pt.TotalAmount); err == nil {
				trends.Monthly = append(trends.Monthly, pt)
			}
		}
	}

	return trends, nil
}

func (r *sqlEntryRepository) GetAdminCreators(ctx context.Context) ([]model.AdminCreatorDetail, error) {
	query := `
		SELECT
			u.id AS creator_id,
			u.username,
			COUNT(DISTINCT w.id) AS total_wallets,
			COUNT(DISTINCT CASE WHEN w.archived_at IS NULL THEN w.id END) AS active_wallets,
			COUNT(DISTINCT CASE WHEN w.archived_at IS NOT NULL THEN w.id END) AS archived_wallets,
			COALESCE(SUM(CASE WHEN e.type = 'titipan' THEN 1 ELSE 0 END), 0) AS total_titipan_count,
			COALESCE(SUM(CASE WHEN e.type = 'titipan' THEN e.amount ELSE 0 END), 0) AS total_titipan_amount,
			COALESCE(SUM(CASE WHEN e.type = 'topup' THEN 1 ELSE 0 END), 0) AS total_topup_count,
			COALESCE(SUM(CASE WHEN e.type = 'topup' THEN e.amount ELSE 0 END), 0) AS total_topup_amount,
			COALESCE(SUM(CASE WHEN e.type = 'koreksi' THEN 1 ELSE 0 END), 0) AS total_koreksi_count,
			COALESCE(SUM(CASE WHEN e.type = 'koreksi' THEN e.amount ELSE 0 END), 0) AS total_koreksi_amount
		FROM users u
		LEFT JOIN wallets w ON w.creator_id = u.id
		LEFT JOIN entries e ON e.wallet_id = w.id
		WHERE u.role = 'user' OR w.id IS NOT NULL
		GROUP BY u.id, u.username
		ORDER BY total_titipan_amount DESC, u.username ASC;
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get admin creators: %w", err)
	}
	defer rows.Close()

	creators := make([]model.AdminCreatorDetail, 0)
	for rows.Next() {
		var c model.AdminCreatorDetail
		if err := rows.Scan(
			&c.CreatorID,
			&c.Username,
			&c.TotalWallets,
			&c.ActiveWallets,
			&c.ArchivedWallets,
			&c.TotalTitipanCount,
			&c.TotalTitipanAmount,
			&c.TotalTopupCount,
			&c.TotalTopupAmount,
			&c.TotalKoreksiCount,
			&c.TotalKoreksiAmount,
		); err != nil {
			return nil, fmt.Errorf("failed to scan admin creator detail: %w", err)
		}
		// Total outstanding for this creator
		c.TotalOutstanding = c.TotalTitipanAmount + c.TotalTopupAmount + c.TotalKoreksiAmount
		creators = append(creators, c)
	}

	return creators, nil
}
