package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/model"
)

type AuditLogFilter struct {
	ActorID    *uuid.UUID
	Action     string
	TargetType string
	Limit      int
	Offset     int
}

type AuditRepository interface {
	Create(ctx context.Context, log *model.AuditLog) error
	List(ctx context.Context, filter AuditLogFilter) ([]model.AuditLog, int64, error)
	Count(ctx context.Context) (int64, error)
}

type sqlAuditRepository struct {
	db *sql.DB
}

func NewAuditRepository(db *sql.DB) AuditRepository {
	return &sqlAuditRepository{db: db}
}

func (r *sqlAuditRepository) Create(ctx context.Context, log *model.AuditLog) error {
	query := `
		INSERT INTO audit_logs (
			actor_id, action, target_type, target_id, metadata, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at;
	`
	now := time.Now().UTC()
	log.CreatedAt = now
	if len(log.Metadata) == 0 {
		log.Metadata = []byte("{}")
	}

	return r.db.QueryRowContext(ctx, query,
		log.ActorID,
		log.Action,
		log.TargetType,
		log.TargetID,
		log.Metadata,
		log.CreatedAt,
	).Scan(&log.ID, &log.CreatedAt)
}

func (r *sqlAuditRepository) List(ctx context.Context, filter AuditLogFilter) ([]model.AuditLog, int64, error) {
	baseWhere := `WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if filter.ActorID != nil {
		baseWhere += fmt.Sprintf(" AND a.actor_id = $%d", argIdx)
		args = append(args, *filter.ActorID)
		argIdx++
	}

	if filter.Action != "" {
		baseWhere += fmt.Sprintf(" AND a.action = $%d", argIdx)
		args = append(args, filter.Action)
		argIdx++
	}

	if filter.TargetType != "" {
		baseWhere += fmt.Sprintf(" AND a.target_type = $%d", argIdx)
		args = append(args, filter.TargetType)
		argIdx++
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM audit_logs a %s;`, baseWhere)
	var total int64
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count audit logs: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT 
			a.id, a.actor_id, a.action, a.target_type, a.target_id, a.metadata, 
			a.created_at,
			COALESCE(u.username, 'system') AS actor_username
		FROM audit_logs a
		LEFT JOIN users u ON a.actor_id = u.id
		%s
		ORDER BY a.created_at DESC
		LIMIT $%d OFFSET $%d;
	`, baseWhere, argIdx, argIdx+1)

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit, filter.Offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list audit logs: %w", err)
	}
	defer rows.Close()

	logs := make([]model.AuditLog, 0)
	for rows.Next() {
		var l model.AuditLog
		if err := rows.Scan(
			&l.ID,
			&l.ActorID,
			&l.Action,
			&l.TargetType,
			&l.TargetID,
			&l.Metadata,
			&l.CreatedAt,
			&l.ActorUsername,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan audit log: %w", err)
		}
		logs = append(logs, l)
	}

	return logs, total, nil
}

func (r *sqlAuditRepository) Count(ctx context.Context) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM audit_logs;`).Scan(&total)
	return total, err
}
