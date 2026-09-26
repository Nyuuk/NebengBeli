package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
	"github.com/nyuuk/nebengbeli/internal/service"
)

// MockEntryRepo for unit testing service layer logic
type mockEntryRepo struct {
	entries map[uuid.UUID]*model.Entry
}

func (m *mockEntryRepo) Create(ctx context.Context, entry *model.Entry) (*model.Entry, bool, error) {
	for _, e := range m.entries {
		if e.ClientID == entry.ClientID {
			return e, true, nil
		}
	}
	entry.ID = uuid.New()
	entry.CreatedAt = time.Now()
	m.entries[entry.ID] = entry
	return entry, false, nil
}

func (m *mockEntryRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.Entry, error) {
	if e, ok := m.entries[id]; ok {
		return e, nil
	}
	return nil, repository.ErrEntryNotFound
}

func (m *mockEntryRepo) GetByClientID(ctx context.Context, clientID uuid.UUID) (*model.Entry, error) {
	for _, e := range m.entries {
		if e.ClientID == clientID {
			return e, nil
		}
	}
	return nil, nil
}

func (m *mockEntryRepo) ListByWallet(ctx context.Context, filter repository.EntryFilter) ([]model.Entry, int64, error) {
	res := make([]model.Entry, 0)
	return res, 0, nil
}

func (m *mockEntryRepo) GetWalletSummary(ctx context.Context, walletID uuid.UUID) (*model.StatementSummary, error) {
	return &model.StatementSummary{}, nil
}

func (m *mockEntryRepo) MoveEntry(ctx context.Context, sourceWalletID, targetWalletID, entryID, createdBy uuid.UUID, notes string) (*model.Entry, *model.Entry, error) {
	orig, ok := m.entries[entryID]
	if !ok {
		return nil, nil, repository.ErrEntryNotFound
	}
	if orig.Type == model.EntryTypeKoreksi {
		return nil, nil, service.ErrInvalidEntryType
	}
	corr := &model.Entry{
		ID:       uuid.New(),
		WalletID: sourceWalletID,
		Type:     model.EntryTypeKoreksi,
		Amount:   -orig.Amount,
	}
	newE := &model.Entry{
		ID:       uuid.New(),
		WalletID: targetWalletID,
		Type:     orig.Type,
		Amount:   orig.Amount,
	}
	return corr, newE, nil
}

func (m *mockEntryRepo) CountAll(ctx context.Context) (int64, int64, error) {
	return int64(len(m.entries)), 0, nil
}

type mockWalletRepo struct {
	wallets map[uuid.UUID]*model.Wallet
}

func (m *mockWalletRepo) Create(ctx context.Context, wallet *model.Wallet) error {
	wallet.ID = uuid.New()
	wallet.CreatedAt = time.Now()
	m.wallets[wallet.ID] = wallet
	return nil
}

func (m *mockWalletRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.Wallet, error) {
	if w, ok := m.wallets[id]; ok {
		return w, nil
	}
	return nil, repository.ErrWalletNotFound
}

func (m *mockWalletRepo) GetByIDWithDetails(ctx context.Context, id uuid.UUID, userID *uuid.UUID) (*model.Wallet, error) {
	return m.GetByID(ctx, id)
}

func (m *mockWalletRepo) ListByUser(ctx context.Context, userID uuid.UUID, includeArchived bool) ([]model.Wallet, error) {
	return make([]model.Wallet, 0), nil
}

func (m *mockWalletRepo) ListAll(ctx context.Context, limit, offset int) ([]model.Wallet, int64, error) {
	return make([]model.Wallet, 0), 0, nil
}

func (m *mockWalletRepo) UpdateName(ctx context.Context, id uuid.UUID, name string) error {
	return nil
}

func (m *mockWalletRepo) SetArchived(ctx context.Context, id uuid.UUID, archived bool) error {
	return nil
}

func (m *mockWalletRepo) SetOwner(ctx context.Context, id uuid.UUID, ownerID uuid.UUID) error {
	return nil
}

func (m *mockWalletRepo) IsUserAuthorized(ctx context.Context, walletID, userID uuid.UUID) (bool, error) {
	return true, nil
}

func (m *mockWalletRepo) Count(ctx context.Context) (int64, int64, error) {
	return int64(len(m.wallets)), 0, nil
}

type mockAuditRepo struct{}

func (m *mockAuditRepo) Create(ctx context.Context, log *model.AuditLog) error {
	return nil
}

func (m *mockAuditRepo) List(ctx context.Context, filter repository.AuditLogFilter) ([]model.AuditLog, int64, error) {
	return make([]model.AuditLog, 0), 0, nil
}

func (m *mockAuditRepo) Count(ctx context.Context) (int64, error) {
	return 0, nil
}

func TestStatementResponseEmptyEntriesNormalized(t *testing.T) {
	resp := model.StatementResponse{
		Wallet: model.Wallet{
			ID:   uuid.New(),
			Name: "Test Wallet",
		},
		Summary:  model.StatementSummary{},
		Entries:  []model.Entry{}, // Non-nil empty slice
		Total:    0,
		Page:     1,
		PageSize: 25,
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("failed to marshal statement response: %v", err)
	}

	if bytes.Contains(data, []byte(`"entries":null`)) {
		t.Errorf("expected entries to be [], but got null in JSON: %s", string(data))
	}
	if !bytes.Contains(data, []byte(`"entries":[]`)) {
		t.Errorf("expected entries to be serialized as [], got: %s", string(data))
	}
}

func TestDisallowCorrectingCorrectionEntry(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	auditRepo := &mockAuditRepo{}

	walletID := uuid.New()
	userID := uuid.New()
	wallet := &model.Wallet{
		ID:        walletID,
		Name:      "Buku Test",
		CreatorID: userID,
	}
	walletRepo.wallets[walletID] = wallet

	// Create initial titipan entry
	origID := uuid.New()
	entryRepo.entries[origID] = &model.Entry{
		ID:        origID,
		ClientID:  uuid.New(),
		WalletID:  walletID,
		Type:      model.EntryTypeTitipan,
		Amount:    50000,
		ItemName:  "Makan Siang",
		CreatedBy: userID,
	}

	// Create correction entry correcting the titipan
	corrID := uuid.New()
	entryRepo.entries[corrID] = &model.Entry{
		ID:              corrID,
		ClientID:        uuid.New(),
		WalletID:        walletID,
		Type:            model.EntryTypeKoreksi,
		Amount:          -10000,
		ItemName:        "Makan Siang",
		CorrectsEntryID: &origID,
		CreatedBy:       userID,
	}

	svc := service.NewEntryService(entryRepo, walletRepo, auditRepo)

	// Attempt to correct the correction entry
	req := service.CreateEntryRequest{
		WalletID:        walletID,
		Type:            model.EntryTypeKoreksi,
		Amount:          5000,
		ItemName:        "Makan Siang",
		CorrectsEntryID: &corrID,
	}

	_, _, err := svc.CreateEntry(context.Background(), userID, model.RoleUser, req)
	if err == nil {
		t.Fatalf("expected error when attempting to correct a correction entry, got nil")
	}

	if !strings.Contains(err.Error(), "cannot correct an entry of type koreksi") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestIdempotentDuplicateEntryHandling(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	auditRepo := &mockAuditRepo{}

	walletID := uuid.New()
	userID := uuid.New()
	wallet := &model.Wallet{
		ID:        walletID,
		Name:      "Buku Test",
		CreatorID: userID,
	}
	walletRepo.wallets[walletID] = wallet

	svc := service.NewEntryService(entryRepo, walletRepo, auditRepo)

	clientID := uuid.New()
	req := service.CreateEntryRequest{
		ClientID: &clientID,
		WalletID: walletID,
		Type:     model.EntryTypeTitipan,
		Amount:   25000,
		ItemName: "Kopi",
	}

	// 1st create: new entry
	entry1, isDup1, err := svc.CreateEntry(context.Background(), userID, model.RoleUser, req)
	if err != nil {
		t.Fatalf("first create failed: %v", err)
	}
	if isDup1 {
		t.Errorf("first create should not be duplicate")
	}

	// 2nd create with identical client_id: idempotent duplicate
	entry2, isDup2, err := svc.CreateEntry(context.Background(), userID, model.RoleUser, req)
	if err != nil {
		t.Fatalf("second create failed: %v", err)
	}
	if !isDup2 {
		t.Errorf("second create with identical client_id must return is_duplicate=true")
	}
	if entry1.ID != entry2.ID {
		t.Errorf("expected same entry ID %s, got %s", entry1.ID, entry2.ID)
	}
}

func TestServiceWorkerFilesExist(t *testing.T) {
	// Verify service-worker.js exists in frontend/public and is valid javascript
	swPath := filepath.Join("..", "..", "frontend", "public", "service-worker.js")
	content, err := os.ReadFile(swPath)
	if err != nil {
		// Fallback check if run from repo root
		swPath = filepath.Join("frontend", "public", "service-worker.js")
		content, err = os.ReadFile(swPath)
		if err != nil {
			t.Fatalf("failed to read service-worker.js: %v", err)
		}
	}

	if !bytes.Contains(content, []byte("addEventListener('install'")) {
		t.Errorf("service-worker.js missing install event listener")
	}
	if !bytes.Contains(content, []byte("addEventListener('fetch'")) {
		t.Errorf("service-worker.js missing fetch event listener")
	}
}
