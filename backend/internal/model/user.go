package model

import (
	"regexp"
	"time"

	"github.com/google/uuid"
)

var validUsernameRegex = regexp.MustCompile(`^[a-z0-9_]{3,30}$`)

// IsValidUsername checks whether a username conforms to the standard specification:
// 3-30 characters, lowercase alphanumeric and underscore only, no spaces.
func IsValidUsername(username string) bool {
	return validUsernameRegex.MatchString(username)
}

type UserRole string

const (
	RoleUser  UserRole = "user"
	RoleAdmin UserRole = "admin"
)

type User struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         UserRole  `json:"role"`
	TokenVersion int       `json:"token_version"`
	CreatedAt    time.Time `json:"created_at"`
}

type UserResponse struct {
	ID                  uuid.UUID `json:"id"`
	Username            string    `json:"username"`
	Role                UserRole  `json:"role"`
	CreatedAt           time.Time `json:"created_at"`
	NeedsUsernameUpdate bool      `json:"needs_username_update"`
}

func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:                  u.ID,
		Username:            u.Username,
		Role:                u.Role,
		CreatedAt:           u.CreatedAt,
		NeedsUsernameUpdate: !IsValidUsername(u.Username),
	}
}
