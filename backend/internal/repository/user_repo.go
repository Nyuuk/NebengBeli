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
	ErrUserNotFound      = errors.New("user not found")
	ErrUsernameDuplicate = errors.New("username already exists")
)

type UserRepository interface {
	Create(ctx context.Context, user *model.User) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.User, error)
	GetByUsername(ctx context.Context, username string) (*model.User, error)
	IncrementTokenVersion(ctx context.Context, id uuid.UUID) (int, error)
	UpdatePassword(ctx context.Context, id uuid.UUID, newPasswordHash string) error
	List(ctx context.Context, limit, offset int) ([]model.User, int64, error)
	Count(ctx context.Context) (int64, error)
}

type sqlUserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
	return &sqlUserRepository{db: db}
}

func (r *sqlUserRepository) Create(ctx context.Context, user *model.User) error {
	query := `
		INSERT INTO users (username, password_hash, role, token_version, created_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at;
	`
	now := time.Now().UTC()
	if user.Role == "" {
		user.Role = model.RoleUser
	}
	if user.TokenVersion == 0 {
		user.TokenVersion = 1
	}
	user.CreatedAt = now

	err := r.db.QueryRowContext(ctx, query,
		user.Username,
		user.PasswordHash,
		user.Role,
		user.TokenVersion,
		user.CreatedAt,
	).Scan(&user.ID, &user.CreatedAt)

	if err != nil {
		if isDuplicateKeyError(err) {
			return ErrUsernameDuplicate
		}
		return fmt.Errorf("failed to insert user: %w", err)
	}

	return nil
}

func (r *sqlUserRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	query := `
		SELECT id, username, password_hash, role, token_version, created_at
		FROM users
		WHERE id = $1;
	`
	user := &model.User{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&user.ID,
		&user.Username,
		&user.PasswordHash,
		&user.Role,
		&user.TokenVersion,
		&user.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by id: %w", err)
	}
	return user, nil
}

func (r *sqlUserRepository) GetByUsername(ctx context.Context, username string) (*model.User, error) {
	query := `
		SELECT id, username, password_hash, role, token_version, created_at
		FROM users
		WHERE username = $1;
	`
	user := &model.User{}
	err := r.db.QueryRowContext(ctx, query, username).Scan(
		&user.ID,
		&user.Username,
		&user.PasswordHash,
		&user.Role,
		&user.TokenVersion,
		&user.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by username: %w", err)
	}
	return user, nil
}

func (r *sqlUserRepository) IncrementTokenVersion(ctx context.Context, id uuid.UUID) (int, error) {
	query := `
		UPDATE users
		SET token_version = token_version + 1
		WHERE id = $1
		RETURNING token_version;
	`
	var newVersion int
	err := r.db.QueryRowContext(ctx, query, id).Scan(&newVersion)
	if err == sql.ErrNoRows {
		return 0, ErrUserNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("failed to increment token version: %w", err)
	}
	return newVersion, nil
}

func (r *sqlUserRepository) UpdatePassword(ctx context.Context, id uuid.UUID, newPasswordHash string) error {
	query := `
		UPDATE users
		SET password_hash = $1, token_version = token_version + 1
		WHERE id = $2;
	`
	res, err := r.db.ExecContext(ctx, query, newPasswordHash, id)
	if err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *sqlUserRepository) List(ctx context.Context, limit, offset int) ([]model.User, int64, error) {
	countQuery := `SELECT COUNT(*) FROM users;`
	var total int64
	if err := r.db.QueryRowContext(ctx, countQuery).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count users: %w", err)
	}

	query := `
		SELECT id, username, password_hash, role, token_version, created_at
		FROM users
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2;
	`
	rows, err := r.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	users := make([]model.User, 0)
	for rows.Next() {
		var u model.User
		if err := rows.Scan(
			&u.ID,
			&u.Username,
			&u.PasswordHash,
			&u.Role,
			&u.TokenVersion,
			&u.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, u)
	}

	return users, total, nil
}

func (r *sqlUserRepository) Count(ctx context.Context) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&total)
	return total, err
}

func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	// PostgreSQL unique_violation error code is 23505
	return contains(err.Error(), "duplicate key") || contains(err.Error(), "23505")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && (containsSubstr(s, substr)))
}

func containsSubstr(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
