package repository

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/model"
)

func TestSameBatchPayload(t *testing.T) {
	clientID := uuid.New()
	walletID := uuid.New()
	creatorID := uuid.New()
	occurredAt := time.Date(2026, 11, 19, 10, 0, 0, 0, time.UTC)
	base := model.Entry{
		ClientID: clientID, WalletID: walletID, Type: model.EntryTypeTitipan,
		Amount: -1200, ItemName: "Kopi", Note: "tanpa gula", OccurredAt: occurredAt,
		CreatedBy: creatorID, OccurredAtProvided: true,
	}

	if !sameBatchPayload(base, base) {
		t.Fatal("identical retry payload should be considered a safe replay")
	}
	omittedTimestamp := base
	omittedTimestamp.OccurredAtProvided = false
	omittedTimestamp.OccurredAt = occurredAt.Add(time.Hour)
	if !sameBatchPayload(base, omittedTimestamp) {
		t.Fatal("omitted occurrence timestamp should use the stored occurrence timestamp on replay")
	}

	conflicts := []struct {
		name   string
		mutate func(*model.Entry)
	}{
		{"wallet", func(e *model.Entry) { e.WalletID = uuid.New() }},
		{"type", func(e *model.Entry) { e.Type = model.EntryTypeTopup }},
		{"amount", func(e *model.Entry) { e.Amount++ }},
		{"item name", func(e *model.Entry) { e.ItemName += "!" }},
		{"note", func(e *model.Entry) { e.Note += "!" }},
		{"occurred at", func(e *model.Entry) { e.OccurredAt = e.OccurredAt.Add(time.Second) }},
		{"correction reference", func(e *model.Entry) { id := uuid.New(); e.CorrectsEntryID = &id }},
		{"correction reason", func(e *model.Entry) { e.CorrectionReason = "different" }},
	}
	for _, tc := range conflicts {
		t.Run(tc.name, func(t *testing.T) {
			candidate := base
			tc.mutate(&candidate)
			if sameBatchPayload(base, candidate) {
				t.Fatalf("conflicting %s must not be treated as an idempotent replay", tc.name)
			}
		})
	}
}

func TestCreateBatchReplayWithOmittedTimestamp(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	clientID, walletID, creatorID, entryID := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	storedAt := time.Date(2026, 11, 19, 10, 0, 0, 0, time.UTC)
	createdAt := storedAt.Add(time.Minute)
	entry := model.Entry{
		ClientID: clientID, WalletID: walletID, Type: model.EntryTypeTitipan,
		Amount: -1200, ItemName: "Kopi", Note: "", OccurredAt: storedAt,
		CreatedBy: creatorID, OccurredAtProvided: false,
	}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("INSERT INTO entries (")).WillReturnRows(sqlmock.NewRows([]string{"id", "created_at"}))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id, client_id, wallet_id, type, amount, item_name, note,")).
		WithArgs(clientID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "client_id", "wallet_id", "type", "amount", "item_name", "note", "corrects_entry_id", "correction_reason", "occurred_at", "created_by", "created_at"}).
			AddRow(entryID, clientID, walletID, string(model.EntryTypeTitipan), int64(-1200), "Kopi", "", nil, "", storedAt, creatorID, createdAt))
	mock.ExpectCommit()

	got, err := NewEntryRepository(db).CreateBatch(context.Background(), []model.Entry{entry})
	if err != nil {
		t.Fatalf("CreateBatch replay: %v", err)
	}
	if len(got) != 1 || got[0].ID != entryID || !got[0].OccurredAt.Equal(storedAt) {
		t.Fatalf("CreateBatch returned unexpected replay result: %+v", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCreateBatchRejectsExplicitTimestampConflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	clientID, walletID, creatorID, entryID := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	storedAt := time.Date(2026, 11, 19, 10, 0, 0, 0, time.UTC)
	entry := model.Entry{
		ClientID: clientID, WalletID: walletID, Type: model.EntryTypeTitipan,
		Amount: -1200, ItemName: "Kopi", OccurredAt: storedAt.Add(time.Second),
		CreatedBy: creatorID, OccurredAtProvided: true,
	}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("INSERT INTO entries (")).WillReturnRows(sqlmock.NewRows([]string{"id", "created_at"}))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id, client_id, wallet_id, type, amount, item_name, note,")).
		WithArgs(clientID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "client_id", "wallet_id", "type", "amount", "item_name", "note", "corrects_entry_id", "correction_reason", "occurred_at", "created_by", "created_at"}).
			AddRow(entryID, clientID, walletID, string(model.EntryTypeTitipan), int64(-1200), "Kopi", "", nil, "", storedAt, creatorID, storedAt))

	_, err = NewEntryRepository(db).CreateBatch(context.Background(), []model.Entry{entry})
	if err == nil {
		t.Fatal("CreateBatch accepted a replay with a conflicting explicit timestamp")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
