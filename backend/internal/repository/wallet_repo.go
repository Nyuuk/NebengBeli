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
	ErrWalletNotFound     = errors.New("wallet not found")
	ErrWalletUnauthorized = errors.New("unauthorized to access wallet")
)

type WalletRepository interface {
	Create(ctx context.Context, wallet *model.Wallet) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Wallet, error)
	GetByIDWithDetails(ctx context.Context, id uuid.UUID, currentUserID *uuid.UUID) (*model.Wallet, error)
	UpdateName(ctx context.Context, id uuid.UUID, name string) error
	SetArchived(ctx context.Context, id uuid.UUID, archive bool) error
	SetOwner(ctx context.Context, id uuid.UUID, ownerID uuid.UUID) error
	UnlinkOwner(ctx context.Context, id uuid.UUID) error
	ListByUser(ctx context.Context, userID uuid.UUID, includeArchived bool) ([]model.Wallet, error)
	ListAll(ctx context.Context, limit, offset int) ([]model.Wallet, int64, error)
	Count(ctx context.Context) (int64, int64, error) // total, active
	IsUserAuthorized(ctx context.Context, walletID, userID uuid.UUID) (bool, error)
	GetCreatorWalletsSummary(ctx context.Context, creatorID uuid.UUID) (int64, int64, int64, []model.Wallet, error)
}

type sqlWalletRepository struct {
	db *sql.DB
}

func NewWalletRepository(db *sql.DB) WalletRepository {
	return &sqlWalletRepository{db: db}
}

func (r *sqlWalletRepository) Create(ctx context.Context, wallet *model.Wallet) error {
	query := `
		INSERT INTO wallets (name, creator_id, owner_id, archived_at, created_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at;
	`
	now := time.Now().UTC()
	wallet.CreatedAt = now

	return r.db.QueryRowContext(ctx, query,
		wallet.Name,
		wallet.CreatorID,
		wallet.OwnerID,
		wallet.ArchivedAt,
		wallet.CreatedAt,
	).Scan(&wallet.ID, &wallet.CreatedAt)
}

func (r *sqlWalletRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Wallet, error) {
	query := `
		SELECT id, name, creator_id, owner_id, archived_at, created_at
		FROM wallets
		WHERE id = $1;
	`
	w := &model.Wallet{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&w.ID,
		&w.Name,
		&w.CreatorID,
		&w.OwnerID,
		&w.ArchivedAt,
		&w.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, ErrWalletNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get wallet: %w", err)
	}
	w.IsArchived = w.ArchivedAt != nil
	return w, nil
}

func (r *sqlWalletRepository) GetByIDWithDetails(ctx context.Context, id uuid.UUID, currentUserID *uuid.UUID) (*model.Wallet, error) {
	query := `
		SELECT 
			w.id, w.name, w.creator_id, w.owner_id, w.archived_at, w.created_at,
			cu.username AS creator_username,
			COALESCE(ou.username, '') AS owner_username,
			COALESCE(SUM(e.amount), 0) AS balance,
			COALESCE(COUNT(e.id), 0) AS entry_count
		FROM wallets w
		JOIN users cu ON w.creator_id = cu.id
		LEFT JOIN users ou ON w.owner_id = ou.id
		LEFT JOIN entries e ON e.wallet_id = w.id
		WHERE w.id = $1
		GROUP BY w.id, cu.username, ou.username;
	`
	w := &model.Wallet{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&w.ID,
		&w.Name,
		&w.CreatorID,
		&w.OwnerID,
		&w.ArchivedAt,
		&w.CreatedAt,
		&w.CreatorUsername,
		&w.OwnerUsername,
		&w.Balance,
		&w.EntryCount,
	)
	if err == sql.ErrNoRows {
		return nil, ErrWalletNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get wallet with details: %w", err)
	}
	w.IsArchived = w.ArchivedAt != nil

	if currentUserID != nil {
		if *currentUserID == w.CreatorID && w.OwnerID != nil && *currentUserID == *w.OwnerID {
			w.UserRole = "both"
		} else if *currentUserID == w.CreatorID {
			w.UserRole = "creator"
		} else if w.OwnerID != nil && *currentUserID == *w.OwnerID {
			w.UserRole = "owner"
		} else {
			w.UserRole = "viewer"
		}
	}

	return w, nil
}

func (r *sqlWalletRepository) UpdateName(ctx context.Context, id uuid.UUID, name string) error {
	query := `
		UPDATE wallets
		SET name = $1
		WHERE id = $2;
	`
	res, err := r.db.ExecContext(ctx, query, name, id)
	if err != nil {
		return fmt.Errorf("failed to update wallet name: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrWalletNotFound
	}
	return nil
}

func (r *sqlWalletRepository) SetArchived(ctx context.Context, id uuid.UUID, archive bool) error {
	var query string
	if archive {
		query = `UPDATE wallets SET archived_at = NOW() WHERE id = $1;`
	} else {
		query = `UPDATE wallets SET archived_at = NULL WHERE id = $1;`
	}
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to update wallet archive status: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrWalletNotFound
	}
	return nil
}

func (r *sqlWalletRepository) SetOwner(ctx context.Context, id uuid.UUID, ownerID uuid.UUID) error {
	query := `
		UPDATE wallets
		SET owner_id = $1
		WHERE id = $2;
	`
	res, err := r.db.ExecContext(ctx, query, ownerID, id)
	if err != nil {
		return fmt.Errorf("failed to set wallet owner: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrWalletNotFound
	}
	return nil
}

func (r *sqlWalletRepository) ListByUser(ctx context.Context, userID uuid.UUID, includeArchived bool) ([]model.Wallet, error) {
	query := `
		SELECT 
			w.id, w.name, w.creator_id, w.owner_id, w.archived_at, w.created_at,
			cu.username AS creator_username,
			COALESCE(ou.username, '') AS owner_username,
			COALESCE(SUM(e.amount), 0) AS balance,
			COALESCE(COUNT(e.id), 0) AS entry_count
		FROM wallets w
		JOIN users cu ON w.creator_id = cu.id
		LEFT JOIN users ou ON w.owner_id = ou.id
		LEFT JOIN entries e ON e.wallet_id = w.id
		WHERE (w.creator_id = $1 OR w.owner_id = $1)
		  AND ($2 = TRUE OR w.archived_at IS NULL)
		GROUP BY w.id, cu.username, ou.username
		ORDER BY w.created_at DESC;
	`
	rows, err := r.db.QueryContext(ctx, query, userID, includeArchived)
	if err != nil {
		return nil, fmt.Errorf("failed to list wallets: %w", err)
	}
	defer rows.Close()

	wallets := make([]model.Wallet, 0)
	for rows.Next() {
		var w model.Wallet
		if err := rows.Scan(
			&w.ID,
			&w.Name,
			&w.CreatorID,
			&w.OwnerID,
			&w.ArchivedAt,
			&w.CreatedAt,
			&w.CreatorUsername,
			&w.OwnerUsername,
			&w.Balance,
			&w.EntryCount,
		); err != nil {
			return nil, fmt.Errorf("failed to scan wallet: %w", err)
		}
		w.IsArchived = w.ArchivedAt != nil
		if userID == w.CreatorID && w.OwnerID != nil && userID == *w.OwnerID {
			w.UserRole = "both"
		} else if userID == w.CreatorID {
			w.UserRole = "creator"
		} else {
			w.UserRole = "owner"
		}
		wallets = append(wallets, w)
	}

	return wallets, nil
}

func (r *sqlWalletRepository) ListAll(ctx context.Context, limit, offset int) ([]model.Wallet, int64, error) {
	countQuery := `SELECT COUNT(*) FROM wallets;`
	var total int64
	if err := r.db.QueryRowContext(ctx, countQuery).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count wallets: %w", err)
	}

	query := `
		SELECT 
			w.id, w.name, w.creator_id, w.owner_id, w.archived_at, w.created_at,
			cu.username AS creator_username,
			COALESCE(ou.username, '') AS owner_username,
			COALESCE(SUM(e.amount), 0) AS balance,
			COALESCE(COUNT(e.id), 0) AS entry_count
		FROM wallets w
		JOIN users cu ON w.creator_id = cu.id
		LEFT JOIN users ou ON w.owner_id = ou.id
		LEFT JOIN entries e ON e.wallet_id = w.id
		GROUP BY w.id, cu.username, ou.username
		ORDER BY w.created_at DESC
		LIMIT $1 OFFSET $2;
	`
	rows, err := r.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list all wallets: %w", err)
	}
	defer rows.Close()

	wallets := make([]model.Wallet, 0)
	for rows.Next() {
		var w model.Wallet
		if err := rows.Scan(
			&w.ID,
			&w.Name,
			&w.CreatorID,
			&w.OwnerID,
			&w.ArchivedAt,
			&w.CreatedAt,
			&w.CreatorUsername,
			&w.OwnerUsername,
			&w.Balance,
			&w.EntryCount,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan wallet: %w", err)
		}
		w.IsArchived = w.ArchivedAt != nil
		wallets = append(wallets, w)
	}

	return wallets, total, nil
}

func (r *sqlWalletRepository) Count(ctx context.Context) (int64, int64, error) {
	var total, active int64
	err := r.db.QueryRowContext(ctx, `
		SELECT 
			COUNT(*),
			COUNT(CASE WHEN archived_at IS NULL THEN 1 END)
		FROM wallets;
	`).Scan(&total, &active)
	return total, active, err
}

func (r *sqlWalletRepository) IsUserAuthorized(ctx context.Context, walletID, userID uuid.UUID) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM wallets
			WHERE id = $1 AND (creator_id = $2 OR owner_id = $2)
		);
	`
	var authorized bool
	err := r.db.QueryRowContext(ctx, query, walletID, userID).Scan(&authorized)
	if err != nil {
		return false, fmt.Errorf("failed to check wallet authorization: %w", err)
	}
	return authorized, nil
}

func (r *sqlWalletRepository) UnlinkOwner(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE wallets
		SET owner_id = NULL
		WHERE id = $1;
	`
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to unlink wallet owner: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrWalletNotFound
	}
	return nil
}

func (r *sqlWalletRepository) GetCreatorWalletsSummary(ctx context.Context, creatorID uuid.UUID) (int64, int64, int64, []model.Wallet, error) {
	query := `
		SELECT
			w.id, w.name, w.creator_id, w.owner_id, w.archived_at, w.created_at,
			cu.username AS creator_username,
			COALESCE(ou.username, '') AS owner_username,
			COALESCE(SUM(e.amount), 0) AS balance,
			COALESCE(COUNT(e.id), 0) AS entry_count
		FROM wallets w
		JOIN users cu ON w.creator_id = cu.id
		LEFT JOIN users ou ON w.owner_id = ou.id
		LEFT JOIN entries e ON e.wallet_id = w.id
		WHERE w.creator_id = $1
		GROUP BY w.id, cu.username, ou.username
		ORDER BY balance ASC, w.created_at DESC;
	`
	rows, err := r.db.QueryContext(ctx, query, creatorID)
	if err != nil {
		return 0, 0, 0, nil, fmt.Errorf("failed to get creator wallets summary: %w", err)
	}
	defer rows.Close()

	var totalOutstanding int64
	var activeCount int64
	var archivedCount int64
	wallets := make([]model.Wallet, 0)

	for rows.Next() {
		var w model.Wallet
		if err := rows.Scan(
			&w.ID,
			&w.Name,
			&w.CreatorID,
			&w.OwnerID,
			&w.ArchivedAt,
			&w.CreatedAt,
			&w.CreatorUsername,
			&w.OwnerUsername,
			&w.Balance,
			&w.EntryCount,
		); err != nil {
			return 0, 0, 0, nil, fmt.Errorf("failed to scan creator wallet: %w", err)
		}
		w.IsArchived = w.ArchivedAt != nil
		if w.IsArchived {
			archivedCount++
		} else {
			activeCount++
			if w.Balance < 0 {
				totalOutstanding += -w.Balance
			}
		}
		w.UserRole = "creator"
		wallets = append(wallets, w)
	}

	return totalOutstanding, activeCount, archivedCount, wallets, nil
}
