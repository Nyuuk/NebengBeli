package model

import (
	"time"

	"github.com/google/uuid"
)

type EntryType string

const (
	EntryTypeTitipan EntryType = "titipan"
	EntryTypeTopup   EntryType = "topup"
	EntryTypeKoreksi EntryType = "koreksi"
)

type Entry struct {
	ID               uuid.UUID  `json:"id"`
	ClientID         uuid.UUID  `json:"client_id"`
	WalletID         uuid.UUID  `json:"wallet_id"`
	Type             EntryType  `json:"type"`
	Amount           int64      `json:"amount"` // Signed BIGINT (e.g., + for titipan/expense, - for topup/settlement)
	ItemName         string     `json:"item_name"`
	Note             string     `json:"note"`
	CorrectsEntryID  *uuid.UUID `json:"corrects_entry_id,omitempty"`
	CorrectionReason string     `json:"correction_reason,omitempty"`
	OccurredAt       time.Time  `json:"occurred_at"`
	CreatedBy        uuid.UUID  `json:"created_by"`
	CreatedAt        time.Time  `json:"created_at"`

	// Derived / populated fields for API responses
	CreatedByUsername string  `json:"created_by_username,omitempty"`
	RunningBalance    int64   `json:"running_balance,omitempty"`
	EffectiveAmount   int64   `json:"effective_amount,omitempty"`
	Corrections       []Entry `json:"corrections,omitempty"`
}

type ItemSuggestion struct {
	ItemName       string    `json:"item_name"`
	LastPrice      int64     `json:"last_price"`
	Frequency      int64     `json:"frequency"`
	LastOccurredAt time.Time `json:"last_occurred_at,omitempty"`
}

type BatchEntryItem struct {
	ClientID   *uuid.UUID `json:"client_id,omitempty"`
	WalletID   uuid.UUID  `json:"wallet_id"`
	Type       EntryType  `json:"type,omitempty"` // Default to titipan if omitted
	Amount     int64      `json:"amount"`
	ItemName   string     `json:"item_name"`
	Note       string     `json:"note,omitempty"`
	OccurredAt *time.Time `json:"occurred_at,omitempty"`
}

type BatchEntriesRequest struct {
	OccurredAt *time.Time       `json:"occurred_at,omitempty"`
	Entries    []BatchEntryItem `json:"entries"`
}

type BatchEntriesResponse struct {
	Message     string  `json:"message"`
	Count       int     `json:"count"`
	TotalAmount int64   `json:"total_amount"`
	Entries     []Entry `json:"entries"`
}

type StatementSummary struct {
	TotalTitipan   int64 `json:"total_titipan"`
	TotalTopup     int64 `json:"total_topup"`
	TotalKoreksi   int64 `json:"total_koreksi"`
	CurrentBalance int64 `json:"current_balance"`
	EntryCount     int64 `json:"entry_count"`
}

type StatementResponse struct {
	Wallet   Wallet           `json:"wallet"`
	Summary  StatementSummary `json:"summary"`
	Entries  []Entry          `json:"entries"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
}
