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
	ErrLinkRequestNotFound = errors.New("link request not found")
	ErrLinkRequestResolved = errors.New("link request is already resolved")
)

type LinkRequestRepository interface {
	Create(ctx context.Context, req *model.LinkRequest) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.LinkRequest, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status model.LinkRequestStatus) error
	ListForUser(ctx context.Context, userID uuid.UUID) ([]model.LinkRequest, error)
	ListByWallet(ctx context.Context, walletID uuid.UUID) ([]model.LinkRequest, error)
}

type sqlLinkRequestRepository struct {
	db *sql.DB
}

func NewLinkRequestRepository(db *sql.DB) LinkRequestRepository {
	return &sqlLinkRequestRepository{db: db}
}

func (r *sqlLinkRequestRepository) Create(ctx context.Context, req *model.LinkRequest) error {
	query := `
		INSERT INTO link_requests (
			wallet_id, requested_by, target_user_id, status, created_at
		)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at;
	`
	now := time.Now().UTC()
	req.CreatedAt = now
	if req.Status == "" {
		req.Status = model.LinkRequestStatusPending
	}

	return r.db.QueryRowContext(ctx, query,
		req.WalletID,
		req.RequestedBy,
		req.TargetUserID,
		req.Status,
		req.CreatedAt,
	).Scan(&req.ID, &req.CreatedAt)
}

func (r *sqlLinkRequestRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.LinkRequest, error) {
	query := `
		SELECT 
			lr.id, lr.wallet_id, lr.requested_by, lr.target_user_id, 
			lr.status, lr.decided_at, lr.created_at,
			w.name AS wallet_name,
			ru.username AS requested_by_username,
			tu.username AS target_username
		FROM link_requests lr
		JOIN wallets w ON lr.wallet_id = w.id
		JOIN users ru ON lr.requested_by = ru.id
		JOIN users tu ON lr.target_user_id = tu.id
		WHERE lr.id = $1;
	`
	lr := &model.LinkRequest{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&lr.ID,
		&lr.WalletID,
		&lr.RequestedBy,
		&lr.TargetUserID,
		&lr.Status,
		&lr.DecidedAt,
		&lr.CreatedAt,
		&lr.WalletName,
		&lr.RequestedByUsername,
		&lr.TargetUsername,
	)
	if err == sql.ErrNoRows {
		return nil, ErrLinkRequestNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get link request: %w", err)
	}
	return lr, nil
}

func (r *sqlLinkRequestRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status model.LinkRequestStatus) error {
	query := `
		UPDATE link_requests
		SET status = $1, decided_at = NOW()
		WHERE id = $2;
	`
	res, err := r.db.ExecContext(ctx, query, status, id)
	if err != nil {
		return fmt.Errorf("failed to update link request status: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrLinkRequestNotFound
	}
	return nil
}

func (r *sqlLinkRequestRepository) ListForUser(ctx context.Context, userID uuid.UUID) ([]model.LinkRequest, error) {
	query := `
		SELECT 
			lr.id, lr.wallet_id, lr.requested_by, lr.target_user_id, 
			lr.status, lr.decided_at, lr.created_at,
			w.name AS wallet_name,
			ru.username AS requested_by_username,
			tu.username AS target_username
		FROM link_requests lr
		JOIN wallets w ON lr.wallet_id = w.id
		JOIN users ru ON lr.requested_by = ru.id
		JOIN users tu ON lr.target_user_id = tu.id
		WHERE (lr.requested_by = $1 OR lr.target_user_id = $1)
		ORDER BY lr.created_at DESC;
	`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list link requests for user: %w", err)
	}
	defer rows.Close()

	reqs := make([]model.LinkRequest, 0)
	for rows.Next() {
		var lr model.LinkRequest
		if err := rows.Scan(
			&lr.ID,
			&lr.WalletID,
			&lr.RequestedBy,
			&lr.TargetUserID,
			&lr.Status,
			&lr.DecidedAt,
			&lr.CreatedAt,
			&lr.WalletName,
			&lr.RequestedByUsername,
			&lr.TargetUsername,
		); err != nil {
			return nil, fmt.Errorf("failed to scan link request: %w", err)
		}
		reqs = append(reqs, lr)
	}

	return reqs, nil
}

func (r *sqlLinkRequestRepository) ListByWallet(ctx context.Context, walletID uuid.UUID) ([]model.LinkRequest, error) {
	query := `
		SELECT 
			lr.id, lr.wallet_id, lr.requested_by, lr.target_user_id, 
			lr.status, lr.decided_at, lr.created_at,
			w.name AS wallet_name,
			ru.username AS requested_by_username,
			tu.username AS target_username
		FROM link_requests lr
		JOIN wallets w ON lr.wallet_id = w.id
		JOIN users ru ON lr.requested_by = ru.id
		JOIN users tu ON lr.target_user_id = tu.id
		WHERE lr.wallet_id = $1
		ORDER BY lr.created_at DESC;
	`
	rows, err := r.db.QueryContext(ctx, query, walletID)
	if err != nil {
		return nil, fmt.Errorf("failed to list link requests by wallet: %w", err)
	}
	defer rows.Close()

	reqs := make([]model.LinkRequest, 0)
	for rows.Next() {
		var lr model.LinkRequest
		if err := rows.Scan(
			&lr.ID,
			&lr.WalletID,
			&lr.RequestedBy,
			&lr.TargetUserID,
			&lr.Status,
			&lr.DecidedAt,
			&lr.CreatedAt,
			&lr.WalletName,
			&lr.RequestedByUsername,
			&lr.TargetUsername,
		); err != nil {
			return nil, fmt.Errorf("failed to scan link request: %w", err)
		}
		reqs = append(reqs, lr)
	}

	return reqs, nil
}
