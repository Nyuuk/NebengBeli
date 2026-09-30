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

type TrendPoint struct {
	Label       string `json:"label"` // e.g. "2026-09-29" or "2026-W39" or "2026-09"
	Count       int64  `json:"count"`
	TotalAmount int64  `json:"total_amount"`
}

type InsightTrends struct {
	Daily   []TrendPoint `json:"daily"`
	Weekly  []TrendPoint `json:"weekly"`
	Monthly []TrendPoint `json:"monthly"`
}

type CreatorInsights struct {
	TotalOutstanding     int64         `json:"total_outstanding"` // Total uang saya yang masih di luar
	TotalActiveWallets   int64         `json:"total_active_wallets"`
	TotalArchivedWallets int64         `json:"total_archived_wallets"`
	Wallets              []Wallet      `json:"wallets"`
	Trends               InsightTrends `json:"trends"`
}
