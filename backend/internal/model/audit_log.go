package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type AuditAction string

const (
	AuditActionUserRegister       AuditAction = "user.register"
	AuditActionUserLogin          AuditAction = "user.login"
	AuditActionUserLogout         AuditAction = "user.logout"
	AuditActionUserPasswordReset  AuditAction = "user.password_reset"
	AuditActionWalletCreate       AuditAction = "wallet.create"
	AuditActionWalletUpdate       AuditAction = "wallet.update"
	AuditActionWalletArchive      AuditAction = "wallet.archive"
	AuditActionWalletUnarchive    AuditAction = "wallet.unarchive"
	AuditActionWalletUnlink       AuditAction = "wallet.unlink"
	AuditActionEntryCreate        AuditAction = "entry.create"
	AuditActionEntryBatchCreate   AuditAction = "entry.batch_create"
	AuditActionEntryCorrect       AuditAction = "entry.correct"
	AuditActionEntryMove          AuditAction = "entry.move"
	AuditActionLinkRequestCreate  AuditAction = "link_request.create"
	AuditActionLinkRequestApprove AuditAction = "link_request.approve"
	AuditActionLinkRequestReject  AuditAction = "link_request.reject"
	AuditActionUserRenew          AuditAction = "user.renew"
	AuditActionAdminInspect       AuditAction = "admin.inspect"
)

type AuditLog struct {
	ID         uuid.UUID       `json:"id"`
	ActorID    *uuid.UUID      `json:"actor_id,omitempty"`
	Action     string          `json:"action"`
	TargetType string          `json:"target_type"`
	TargetID   *string         `json:"target_id,omitempty"`
	Metadata   json.RawMessage `json:"metadata"`
	CreatedAt  time.Time       `json:"created_at"`

	// Derived
	ActorUsername string `json:"actor_username,omitempty"`
}
