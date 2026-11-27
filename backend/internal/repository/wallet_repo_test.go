package repository

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
)

// UserRole describes the wallet relationship, not the caller's global role.
// An unrelated admin remains a viewer; an owner must never become a creator.
func TestWalletDetailsUserRole(t *testing.T) {
	creatorID, ownerID, adminID, walletID := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	for _, tc := range []struct {
		name    string
		userID  *uuid.UUID
		ownerID *uuid.UUID
		want    string
	}{
		{"unrelated-admin", &adminID, &ownerID, "viewer"},
		{"linked-owner", &ownerID, &ownerID, "owner"},
		{"creator", &creatorID, &ownerID, "creator"},
		{"both", &creatorID, &creatorID, "both"},
		{"unlinked-admin", &adminID, nil, "viewer"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			rows := sqlmock.NewRows([]string{"id", "name", "creator_id", "owner_id", "archived_at", "created_at", "creator_username", "owner_username", "balance", "entry_count"}).AddRow(walletID, "Wallet", creatorID, tc.ownerID, nil, time.Now(), "creator", "owner", 0, 0)
			mock.ExpectQuery("SELECT").WithArgs(walletID).WillReturnRows(rows)
			wallet, err := NewWalletRepository(db).GetByIDWithDetails(context.Background(), walletID, tc.userID)
			if err != nil {
				t.Fatal(err)
			}
			if wallet.UserRole != tc.want {
				t.Fatalf("user_role = %q, want %q", wallet.UserRole, tc.want)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
