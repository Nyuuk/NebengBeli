package model

import (
	"time"

	"github.com/google/uuid"
)

type LinkRequestStatus string

const (
	LinkRequestStatusPending  LinkRequestStatus = "pending"
	LinkRequestStatusApproved LinkRequestStatus = "approved"
	LinkRequestStatusRejected LinkRequestStatus = "rejected"
)

type LinkRequest struct {
	ID           uuid.UUID         `json:"id"`
	WalletID     uuid.UUID         `json:"wallet_id"`
	RequestedBy  uuid.UUID         `json:"requested_by"`
	TargetUserID uuid.UUID         `json:"target_user_id"`
	Status       LinkRequestStatus `json:"status"`
	DecidedAt    *time.Time        `json:"decided_at,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`

	// Derived / populated fields
	WalletName          string `json:"wallet_name,omitempty"`
	RequestedByUsername string `json:"requested_by_username,omitempty"`
	TargetUsername      string `json:"target_username,omitempty"`
}
