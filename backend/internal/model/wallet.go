package model

import (
	"time"

	"github.com/google/uuid"
)

type Wallet struct {
	ID         uuid.UUID  `json:"id"`
	Name       string     `json:"name"`
	CreatorID  uuid.UUID  `json:"creator_id"`
	OwnerID    *uuid.UUID `json:"owner_id,omitempty"`
	ArchivedAt *time.Time `json:"archived_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`

	// Derived / populated fields for API responses
	CreatorUsername string `json:"creator_username,omitempty"`
	OwnerUsername   string `json:"owner_username,omitempty"`
	Balance         int64  `json:"balance"`
	EntryCount      int64  `json:"entry_count"`
	IsArchived      bool   `json:"is_archived"`
	UserRole        string `json:"user_role,omitempty"` // "creator", "owner", or "both"
}
