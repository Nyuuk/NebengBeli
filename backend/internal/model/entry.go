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
	Amount           int64      `json:"amount"` // Signed BIGINT (- for titipan/debit, + for topup/credit)
	ItemName         string     `json:"item_name"`
	Note             string     `json:"note"`
	CorrectsEntryID  *uuid.UUID `json:"corrects_entry_id,omitempty"`
	CorrectionReason string     `json:"correction_reason,omitempty"`
	OccurredAt       time.Time  `json:"occurred_at"`
	CreatedBy        uuid.UUID  `json:"created_by"`
	CreatedAt        time.Time  `json:"created_at"`

	// Derived / populated fields for API responses
	CreatedByUsername     string  `json:"created_by_username,omitempty"`
	WalletName            string  `json:"wallet_name,omitempty"`
	WalletCreatorUsername string  `json:"wallet_creator_username,omitempty"`
	WalletOwnerUsername   string  `json:"wallet_owner_username,omitempty"`
	RunningBalance        int64   `json:"running_balance,omitempty"`
	EffectiveAmount       int64   `json:"effective_amount,omitempty"`
	Corrections           []Entry `json:"corrections,omitempty"`
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
	TotalTitipan    int64 `json:"total_titipan"`
	TotalTopup      int64 `json:"total_topup"`
	TotalKoreksi    int64 `json:"total_koreksi"`
	CurrentBalance  int64 `json:"current_balance"`
	StartingBalance int64 `json:"starting_balance,omitempty"`
	EndingBalance   int64 `json:"ending_balance,omitempty"`
	PeriodTotal     int64 `json:"period_total,omitempty"`
	EntryCount      int64 `json:"entry_count"`
}

type StatementResponse struct {
	Wallet   Wallet           `json:"wallet"`
	Summary  StatementSummary `json:"summary"`
	Entries  []Entry          `json:"entries"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
}

type AdminPeriodSummary struct {
	TotalTitipanCount  int64 `json:"total_titipan_count"`
	TotalTitipanAmount int64 `json:"total_titipan_amount"`
	TotalTopupCount    int64 `json:"total_topup_count"`
	TotalTopupAmount   int64 `json:"total_topup_amount"`
	TotalKoreksiCount  int64 `json:"total_koreksi_count"`
	TotalKoreksiAmount int64 `json:"total_koreksi_amount"`
	TotalCount         int64 `json:"total_count"`
	TotalVolume        int64 `json:"total_volume"`
	NetBalance         int64 `json:"net_balance"`
}

type AdminEntriesResponse struct {
	Entries []Entry            `json:"entries"`
	Total   int64              `json:"total"`
	Summary AdminPeriodSummary `json:"summary"`
	Page    int                `json:"page"`
	Limit   int                `json:"limit"`
}

type AdminCreatorDetail struct {
	CreatorID          uuid.UUID `json:"creator_id"`
	Username           string    `json:"username"`
	TotalWallets       int64     `json:"total_wallets"`
	ActiveWallets      int64     `json:"active_wallets"`
	ArchivedWallets    int64     `json:"archived_wallets"`
	TotalTitipanCount  int64     `json:"total_titipan_count"`
	TotalTitipanAmount int64     `json:"total_titipan_amount"`
	TotalTopupCount    int64     `json:"total_topup_count"`
	TotalTopupAmount   int64     `json:"total_topup_amount"`
	TotalKoreksiCount  int64     `json:"total_koreksi_count"`
	TotalKoreksiAmount int64     `json:"total_koreksi_amount"`
	TotalOutstanding   int64     `json:"total_outstanding"`
}
