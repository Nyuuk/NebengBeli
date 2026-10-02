package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/config"
	"github.com/nyuuk/nebengbeli/internal/handler"
	"github.com/nyuuk/nebengbeli/internal/middleware"
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
		entryCopy := *e
		var eff int64 = entryCopy.Amount
		for _, c := range m.entries {
			if c.CorrectsEntryID != nil && *c.CorrectsEntryID == id {
				eff += c.Amount
			}
		}
		entryCopy.EffectiveAmount = eff
		return &entryCopy, nil
	}
	return nil, repository.ErrEntryNotFound
}

func (m *mockEntryRepo) GetByClientID(ctx context.Context, clientID uuid.UUID) (*model.Entry, error) {
	for _, e := range m.entries {
		if e.ClientID == clientID {
			entryCopy := *e
			var eff int64 = entryCopy.Amount
			for _, c := range m.entries {
				if c.CorrectsEntryID != nil && *c.CorrectsEntryID == e.ID {
					eff += c.Amount
				}
			}
			entryCopy.EffectiveAmount = eff
			return &entryCopy, nil
		}
	}
	return nil, nil
}

func (m *mockEntryRepo) ListByWallet(ctx context.Context, filter repository.EntryFilter) ([]model.Entry, int64, error) {
	res := make([]model.Entry, 0)
	for _, e := range m.entries {
		if e.WalletID == filter.WalletID {
			if filter.Type != nil && e.Type != *filter.Type {
				continue
			}
			if filter.StartDate != nil && e.OccurredAt.Before(*filter.StartDate) {
				continue
			}
			if filter.EndDate != nil && e.OccurredAt.After(*filter.EndDate) {
				continue
			}
			res = append(res, *e)
		}
	}
	return res, int64(len(res)), nil
}

func (m *mockEntryRepo) ListAdminEntries(ctx context.Context, filter repository.AdminEntryFilter) ([]model.Entry, int64, *model.AdminPeriodSummary, error) {
	res := make([]model.Entry, 0)
	summary := &model.AdminPeriodSummary{}
	for _, e := range m.entries {
		if filter.WalletID != nil && e.WalletID != *filter.WalletID {
			continue
		}
		if filter.Type != nil && e.Type != *filter.Type {
			continue
		}
		if filter.StartDate != nil && e.OccurredAt.Before(*filter.StartDate) {
			continue
		}
		if filter.EndDate != nil && e.OccurredAt.After(*filter.EndDate) {
			continue
		}
		res = append(res, *e)
		switch e.Type {
		case model.EntryTypeTitipan:
			summary.TotalTitipanCount++
			summary.TotalTitipanAmount += e.Amount
		case model.EntryTypeTopup:
			summary.TotalTopupCount++
			summary.TotalTopupAmount += e.Amount
		case model.EntryTypeKoreksi:
			summary.TotalKoreksiCount++
			summary.TotalKoreksiAmount += e.Amount
		}
		summary.TotalCount++
		vol := e.Amount
		if vol < 0 {
			vol = -vol
		}
		summary.TotalVolume += vol
		summary.NetBalance += e.Amount
	}
	return res, int64(len(res)), summary, nil
}

func (m *mockEntryRepo) GetWalletSummary(ctx context.Context, walletID uuid.UUID) (*model.StatementSummary, error) {
	return m.GetWalletSummaryWithFilter(ctx, walletID, nil, nil)
}

func (m *mockEntryRepo) GetWalletSummaryWithFilter(ctx context.Context, walletID uuid.UUID, startDate, endDate *time.Time) (*model.StatementSummary, error) {
	summary := &model.StatementSummary{}
	for _, e := range m.entries {
		if e.WalletID == walletID {
			switch e.Type {
			case model.EntryTypeTitipan:
				summary.TotalTitipan += e.Amount
			case model.EntryTypeTopup:
				summary.TotalTopup += e.Amount
			case model.EntryTypeKoreksi:
				summary.TotalKoreksi += e.Amount
			}
			summary.CurrentBalance += e.Amount
			summary.EntryCount++

			if startDate != nil && e.OccurredAt.Before(*startDate) {
				summary.StartingBalance += e.Amount
			}
			if startDate != nil {
				inRange := !e.OccurredAt.Before(*startDate) && (endDate == nil || !e.OccurredAt.After(*endDate))
				if inRange {
					summary.PeriodTotal += e.Amount
				}
			}
		}
	}
	if startDate != nil {
		summary.EndingBalance = summary.StartingBalance + summary.PeriodTotal
	} else {
		summary.StartingBalance = 0
		summary.PeriodTotal = summary.CurrentBalance
		summary.EndingBalance = summary.CurrentBalance
	}
	return summary, nil
}

func (m *mockEntryRepo) MoveEntry(ctx context.Context, sourceWalletID, targetWalletID, entryID, createdBy uuid.UUID, notes string, correctionClientID, targetClientID *uuid.UUID) (*model.Entry, *model.Entry, error) {
	orig, ok := m.entries[entryID]
	if !ok {
		return nil, nil, repository.ErrEntryNotFound
	}
	if orig.Type == model.EntryTypeKoreksi {
		return nil, nil, errors.New("cannot move an entry of type koreksi")
	}

	var eff int64 = orig.Amount
	for _, c := range m.entries {
		if c.CorrectsEntryID != nil && *c.CorrectsEntryID == entryID {
			eff += c.Amount
		}
	}

	cID := uuid.New()
	if correctionClientID != nil && *correctionClientID != uuid.Nil {
		cID = *correctionClientID
	}
	tID := uuid.New()
	if targetClientID != nil && *targetClientID != uuid.Nil {
		tID = *targetClientID
	}

	var existingCorr, existingTgt *model.Entry
	for _, e := range m.entries {
		if e.ClientID == cID {
			existingCorr = e
		}
		if e.ClientID == tID {
			existingTgt = e
		}
	}
	if existingCorr != nil && existingTgt != nil {
		return existingCorr, existingTgt, nil
	}

	corr := &model.Entry{
		ID:               uuid.New(),
		ClientID:         cID,
		WalletID:         sourceWalletID,
		Type:             model.EntryTypeKoreksi,
		Amount:           -eff,
		ItemName:         orig.ItemName,
		Note:             fmt.Sprintf("Pindah ke dompet lain. %s", notes),
		CorrectsEntryID:  &entryID,
		CorrectionReason: "salah dompet",
		OccurredAt:       time.Now(),
		CreatedBy:        createdBy,
		CreatedAt:        time.Now(),
	}
	newE := &model.Entry{
		ID:         uuid.New(),
		ClientID:   tID,
		WalletID:   targetWalletID,
		Type:       orig.Type,
		Amount:     eff,
		ItemName:   orig.ItemName,
		Note:       fmt.Sprintf("Pindahan dari dompet asal. %s", notes),
		OccurredAt: orig.OccurredAt,
		CreatedBy:  createdBy,
		CreatedAt:  time.Now(),
	}
	m.entries[corr.ID] = corr
	m.entries[newE.ID] = newE
	return corr, newE, nil
}

func (m *mockEntryRepo) GetAdminTrends(ctx context.Context) (*model.InsightTrends, error) {
	return &model.InsightTrends{
		Daily:   []model.TrendPoint{},
		Weekly:  []model.TrendPoint{},
		Monthly: []model.TrendPoint{},
	}, nil
}

func (m *mockEntryRepo) GetAdminCreators(ctx context.Context) ([]model.AdminCreatorDetail, error) {
	return []model.AdminCreatorDetail{}, nil
}

func (m *mockEntryRepo) GetAdminStatsBreakdown(ctx context.Context) (map[string]map[string]int64, error) {
	return map[string]map[string]int64{
		"titipan": {"count": 0, "total_amount": 0, "total_volume": 0},
		"topup":   {"count": 0, "total_amount": 0, "total_volume": 0},
		"koreksi": {"count": 0, "total_amount": 0, "total_volume": 0},
	}, nil
}

func (m *mockEntryRepo) CreateBatch(ctx context.Context, entries []model.Entry) ([]model.Entry, error) {
	created := make([]model.Entry, 0, len(entries))
	for _, e := range entries {
		entryCopy := e
		entryCopy.ID = uuid.New()
		entryCopy.CreatedAt = time.Now()
		m.entries[entryCopy.ID] = &entryCopy
		created = append(created, entryCopy)
	}
	return created, nil
}

func (m *mockEntryRepo) GetCorrectionsByEntryID(ctx context.Context, entryID uuid.UUID) ([]model.Entry, error) {
	res := make([]model.Entry, 0)
	for _, e := range m.entries {
		if e.CorrectsEntryID != nil && *e.CorrectsEntryID == entryID {
			res = append(res, *e)
		}
	}
	return res, nil
}

func (m *mockEntryRepo) GetItemSuggestions(ctx context.Context, walletID uuid.UUID, query string, limit int) ([]model.ItemSuggestion, error) {
	itemCounts := make(map[string]int64)
	itemPrices := make(map[string]int64)
	for _, e := range m.entries {
		if e.WalletID == walletID && e.Type == model.EntryTypeTitipan {
			itemCounts[e.ItemName]++
			price := e.Amount
			if price < 0 {
				price = -price
			}
			itemPrices[e.ItemName] = price
		}
	}
	res := make([]model.ItemSuggestion, 0)
	for name, count := range itemCounts {
		res = append(res, model.ItemSuggestion{
			ItemName:  name,
			LastPrice: itemPrices[name],
			Frequency: count,
		})
	}
	return res, nil
}

func (m *mockEntryRepo) GetTrendsByCreator(ctx context.Context, creatorID uuid.UUID) (*model.InsightTrends, error) {
	return &model.InsightTrends{
		Daily:   []model.TrendPoint{},
		Weekly:  []model.TrendPoint{},
		Monthly: []model.TrendPoint{},
	}, nil
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
	res := make([]model.Wallet, 0)
	for _, w := range m.wallets {
		if w.CreatorID == userID || (w.OwnerID != nil && *w.OwnerID == userID) {
			if includeArchived || w.ArchivedAt == nil {
				res = append(res, *w)
			}
		}
	}
	return res, nil
}

func (m *mockWalletRepo) ListAll(ctx context.Context, limit, offset int) ([]model.Wallet, int64, error) {
	return make([]model.Wallet, 0), 0, nil
}

func (m *mockWalletRepo) UpdateName(ctx context.Context, id uuid.UUID, name string) error {
	if w, ok := m.wallets[id]; ok {
		w.Name = name
		return nil
	}
	return repository.ErrWalletNotFound
}

func (m *mockWalletRepo) SetArchived(ctx context.Context, id uuid.UUID, archived bool) error {
	if w, ok := m.wallets[id]; ok {
		if archived {
			now := time.Now()
			w.ArchivedAt = &now
			w.IsArchived = true
		} else {
			w.ArchivedAt = nil
			w.IsArchived = false
		}
		return nil
	}
	return repository.ErrWalletNotFound
}

func (m *mockWalletRepo) SetOwner(ctx context.Context, id uuid.UUID, ownerID uuid.UUID) error {
	if w, ok := m.wallets[id]; ok {
		w.OwnerID = &ownerID
		return nil
	}
	return repository.ErrWalletNotFound
}

func (m *mockWalletRepo) UnlinkOwner(ctx context.Context, id uuid.UUID) error {
	if w, ok := m.wallets[id]; ok {
		w.OwnerID = nil
		return nil
	}
	return repository.ErrWalletNotFound
}

func (m *mockWalletRepo) GetCreatorWalletsSummary(ctx context.Context, creatorID uuid.UUID) (int64, int64, int64, []model.Wallet, error) {
	var totalOutstanding, activeCount, archivedCount int64
	wallets := make([]model.Wallet, 0)
	for _, w := range m.wallets {
		if w.CreatorID == creatorID {
			if w.ArchivedAt != nil {
				archivedCount++
			} else {
				activeCount++
				if w.Balance < 0 {
					totalOutstanding += -w.Balance
				}
			}
			wallets = append(wallets, *w)
		}
	}
	return totalOutstanding, activeCount, archivedCount, wallets, nil
}

func (m *mockWalletRepo) IsUserAuthorized(ctx context.Context, walletID, userID uuid.UUID) (bool, error) {
	w, ok := m.wallets[walletID]
	if !ok {
		return false, nil
	}
	return w.CreatorID == userID || (w.OwnerID != nil && *w.OwnerID == userID), nil
}

func (m *mockWalletRepo) Count(ctx context.Context) (int64, int64, error) {
	return int64(len(m.wallets)), 0, nil
}

type mockAuditRepo struct {
	logs []*model.AuditLog
}

func (m *mockAuditRepo) Create(ctx context.Context, log *model.AuditLog) error {
	m.logs = append(m.logs, log)
	return nil
}

func (m *mockAuditRepo) List(ctx context.Context, filter repository.AuditLogFilter) ([]model.AuditLog, int64, error) {
	return make([]model.AuditLog, 0), 0, nil
}

func (m *mockAuditRepo) Count(ctx context.Context) (int64, error) {
	return int64(len(m.logs)), nil
}

type mockUserRepo struct {
	users     map[string]*model.User
	usersByID map[uuid.UUID]*model.User
}

func (m *mockUserRepo) Create(ctx context.Context, user *model.User) error {
	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}
	user.CreatedAt = time.Now()
	m.users[user.Username] = user
	m.usersByID[user.ID] = user
	return nil
}

func (m *mockUserRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	if u, ok := m.usersByID[id]; ok {
		return u, nil
	}
	return nil, repository.ErrUserNotFound
}

func (m *mockUserRepo) GetByUsername(ctx context.Context, username string) (*model.User, error) {
	if u, ok := m.users[username]; ok {
		return u, nil
	}
	return nil, repository.ErrUserNotFound
}

func (m *mockUserRepo) IncrementTokenVersion(ctx context.Context, id uuid.UUID) (int, error) {
	if u, ok := m.usersByID[id]; ok {
		u.TokenVersion++
		return u.TokenVersion, nil
	}
	return 0, repository.ErrUserNotFound
}

func (m *mockUserRepo) UpdatePassword(ctx context.Context, id uuid.UUID, newPasswordHash string) error {
	if u, ok := m.usersByID[id]; ok {
		u.PasswordHash = newPasswordHash
		u.TokenVersion++
		return nil
	}
	return repository.ErrUserNotFound
}

func (m *mockUserRepo) List(ctx context.Context, limit, offset int) ([]model.User, int64, error) {
	res := make([]model.User, 0)
	for _, u := range m.usersByID {
		res = append(res, *u)
	}
	return res, int64(len(res)), nil
}

func (m *mockUserRepo) Count(ctx context.Context) (int64, error) {
	return int64(len(m.usersByID)), nil
}

type mockLinkRepo struct {
	reqs map[uuid.UUID]*model.LinkRequest
}

func (m *mockLinkRepo) Create(ctx context.Context, req *model.LinkRequest) error {
	if req.ID == uuid.Nil {
		req.ID = uuid.New()
	}
	if m.reqs == nil {
		m.reqs = make(map[uuid.UUID]*model.LinkRequest)
	}
	m.reqs[req.ID] = req
	return nil
}

func (m *mockLinkRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.LinkRequest, error) {
	if m.reqs != nil {
		if r, ok := m.reqs[id]; ok {
			return r, nil
		}
	}
	return nil, repository.ErrLinkRequestNotFound
}

func (m *mockLinkRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status model.LinkRequestStatus) error {
	if m.reqs != nil {
		if r, ok := m.reqs[id]; ok {
			r.Status = status
			now := time.Now()
			r.DecidedAt = &now
			return nil
		}
	}
	return repository.ErrLinkRequestNotFound
}

func (m *mockLinkRepo) ListForUser(ctx context.Context, userID uuid.UUID) ([]model.LinkRequest, error) {
	res := make([]model.LinkRequest, 0)
	if m.reqs != nil {
		for _, r := range m.reqs {
			if r.RequestedBy == userID || r.TargetUserID == userID {
				res = append(res, *r)
			}
		}
	}
	return res, nil
}

func (m *mockLinkRepo) ListByWallet(ctx context.Context, walletID uuid.UUID) ([]model.LinkRequest, error) {
	res := make([]model.LinkRequest, 0)
	if m.reqs != nil {
		for _, r := range m.reqs {
			if r.WalletID == walletID {
				res = append(res, *r)
			}
		}
	}
	return res, nil
}

func (m *mockLinkRepo) CancelPendingForWallet(ctx context.Context, walletID uuid.UUID) error {
	if m.reqs != nil {
		for _, r := range m.reqs {
			if r.WalletID == walletID && r.Status == model.LinkRequestStatusPending {
				r.Status = model.LinkRequestStatusRejected
			}
		}
	}
	return nil
}

func (m *mockLinkRepo) GetPendingByWallet(ctx context.Context, walletID uuid.UUID) (*model.LinkRequest, error) {
	if m.reqs != nil {
		for _, r := range m.reqs {
			if r.WalletID == walletID && r.Status == model.LinkRequestStatusPending {
				return r, nil
			}
		}
	}
	return nil, nil
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

func TestManifestJsonStructure(t *testing.T) {
	manifestPath := filepath.Join("..", "..", "frontend", "public", "manifest.json")
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		manifestPath = filepath.Join("frontend", "public", "manifest.json")
		content, err = os.ReadFile(manifestPath)
		if err != nil {
			t.Fatalf("failed to read manifest.json: %v", err)
		}
	}

	var manifest map[string]interface{}
	if err := json.Unmarshal(content, &manifest); err != nil {
		t.Fatalf("manifest.json is not valid JSON: %v", err)
	}

	if manifest["name"] == "" || manifest["short_name"] == "" {
		t.Errorf("manifest.json missing name or short_name")
	}
	if manifest["display"] != "standalone" {
		t.Errorf("expected display standalone, got %v", manifest["display"])
	}
	if manifest["start_url"] != "/" {
		t.Errorf("expected start_url '/', got %v", manifest["start_url"])
	}
}

func TestDevEndpointsDisabledInProduction(t *testing.T) {
	cfg := &config.Config{
		Environment:        "production",
		EnableDevEndpoints: false,
		JWTSecret:          "secret-key-32-chars-minimum-length!",
		JWTExpiry:          1 * time.Hour,
	}

	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	linkRepo := &mockLinkRepo{}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)

	devHandler := handler.NewDevHandler(nil, userRepo, walletRepo, entryRepo, linkRepo, auditRepo, jwtMgr, cfg)

	r := gin.New()
	api := r.Group("/api")
	if cfg.EnableDevEndpoints {
		dev := api.Group("/dev")
		{
			dev.GET("/status", devHandler.Status)
			dev.POST("/session", devHandler.CreateSession)
			dev.POST("/fixtures/reset", devHandler.ResetFixtures)
			dev.POST("/fixtures/seed", devHandler.SeedFixtures)
		}
	}

	// 1. Check status endpoint is 404 in production
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/dev/status", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for /api/dev/status in production, got %d", w.Code)
	}

	// 2. Check session creation is 404 in production
	body := `{"username":"test_creator","role":"user"}`
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/api/dev/session", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for /api/dev/session in production, got %d", w.Code)
	}
}

func TestDevSessionEndpointStrictlyDisabledFailClosed(t *testing.T) {
	cfg := &config.Config{
		Environment:        "development",
		EnableDevEndpoints: true,
		JWTSecret:          "secret-key-32-chars-minimum-length!",
		JWTExpiry:          1 * time.Hour,
	}

	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	linkRepo := &mockLinkRepo{}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)

	devHandler := handler.NewDevHandler(nil, userRepo, walletRepo, entryRepo, linkRepo, auditRepo, jwtMgr, cfg)

	r := gin.New()
	api := r.Group("/api")
	if cfg.EnableDevEndpoints {
		dev := api.Group("/dev")
		{
			dev.GET("/status", devHandler.Status)
			dev.POST("/session", devHandler.CreateSession)
		}
	}

	payloads := []struct {
		desc string
		body string
	}{
		{"empty payload", `{}`},
		{"fixture creator username", `{"username":"test_creator"}`},
		{"fixture owner username", `{"username":"test_owner"}`},
		{"fixture admin username", `{"username":"test_admin"}`},
		{"fixture creator persona", `{"persona":"creator"}`},
		{"fixture admin persona", `{"persona":"admin"}`},
		{"arbitrary username", `{"username":"arbitrary_user"}`},
		{"attacker persona", `{"persona":"attacker"}`},
		{"role escalation attempt", `{"username":"test_creator","role":"admin"}`},
	}

	for _, tc := range payloads {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/dev/session", strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("[%s] expected 403 Forbidden for /api/dev/session, got %d: %s", tc.desc, w.Code, w.Body.String())
		}

		// Ensure no auth cookie was issued
		if cookieHeader := w.Header().Get("Set-Cookie"); cookieHeader != "" {
			t.Errorf("[%s] expected no Set-Cookie header on rejected dev session, got: %s", tc.desc, cookieHeader)
		}

		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["token"] != nil {
			t.Errorf("[%s] expected no token issued on rejected dev session, got: %v", tc.desc, resp["token"])
		}
	}
}

func TestConfigDevEndpointsFailClosed(t *testing.T) {
	// Scenario 1: Development with no ENABLE_DEV_ENDPOINTS set -> must be false (fail-closed)
	os.Setenv("ENVIRONMENT", "development")
	os.Unsetenv("ENABLE_DEV_ENDPOINTS")
	cfg := config.LoadConfig()
	if cfg.EnableDevEndpoints {
		t.Errorf("expected EnableDevEndpoints to be false by default in development, got true")
	}

	// Scenario 2: Staging with ENABLE_DEV_ENDPOINTS=true -> must be false (only local dev allowed)
	os.Setenv("ENVIRONMENT", "staging")
	os.Setenv("ENABLE_DEV_ENDPOINTS", "true")
	cfg = config.LoadConfig()
	if cfg.EnableDevEndpoints {
		t.Errorf("expected EnableDevEndpoints to be false in staging even when ENABLE_DEV_ENDPOINTS=true, got true")
	}

	// Scenario 3: Production with ENABLE_DEV_ENDPOINTS=true -> must be false
	os.Setenv("ENVIRONMENT", "production")
	os.Setenv("ENABLE_DEV_ENDPOINTS", "true")
	cfg = config.LoadConfig()
	if cfg.EnableDevEndpoints {
		t.Errorf("expected EnableDevEndpoints to be false in production, got true")
	}

	// Scenario 4: Local development with ENABLE_DEV_ENDPOINTS=true -> explicitly enabled
	os.Setenv("ENVIRONMENT", "development")
	os.Setenv("ENABLE_DEV_ENDPOINTS", "true")
	cfg = config.LoadConfig()
	if !cfg.EnableDevEndpoints {
		t.Errorf("expected EnableDevEndpoints to be true in development when explicitly set to true, got false")
	}

	// Cleanup
	os.Unsetenv("ENABLE_DEV_ENDPOINTS")
	os.Setenv("ENVIRONMENT", "development")
}

func TestIndexHtmlServiceWorkerDoesNotRegisterOnFileProtocol(t *testing.T) {
	indexPath := filepath.Join("..", "..", "frontend", "index.html")
	content, err := os.ReadFile(indexPath)
	if err != nil {
		indexPath = filepath.Join("frontend", "index.html")
		content, err = os.ReadFile(indexPath)
		if err != nil {
			t.Fatalf("failed to read frontend/index.html: %v", err)
		}
	}

	contentStr := string(content)
	if strings.Contains(contentStr, "file:") {
		t.Errorf("frontend/index.html should not contain file: protocol condition for service worker registration")
	}
	if !strings.Contains(contentStr, "navigator.serviceWorker.register") {
		t.Errorf("frontend/index.html missing navigator.serviceWorker.register")
	}
	if !strings.Contains(contentStr, "isSecureContext") {
		t.Errorf("frontend/index.html missing isSecureContext check")
	}
}

func TestNginxConfigurationHasSecurityAndPWAHeaders(t *testing.T) {
	nginxPaths := []string{
		filepath.Join("..", "..", "nginx.conf"),
		filepath.Join("nginx.conf"),
	}

	var content []byte
	var err error
	for _, p := range nginxPaths {
		content, err = os.ReadFile(p)
		if err == nil {
			break
		}
	}
	if err != nil {
		t.Fatalf("failed to read nginx.conf: %v", err)
	}

	nginxStr := string(content)
	if !strings.Contains(nginxStr, "listen 8080;") {
		t.Errorf("nginx.conf missing 'listen 8080;'")
	}
	if !strings.Contains(nginxStr, "Service-Worker-Allowed") {
		t.Errorf("nginx.conf missing Service-Worker-Allowed header")
	}
	if !strings.Contains(nginxStr, "application/manifest+json") {
		t.Errorf("nginx.conf missing application/manifest+json content-type")
	}
	if !strings.Contains(nginxStr, "X-Content-Type-Options") {
		t.Errorf("nginx.conf missing X-Content-Type-Options security header")
	}
	if !strings.Contains(nginxStr, "X-Frame-Options") {
		t.Errorf("nginx.conf missing X-Frame-Options security header")
	}
	if !strings.Contains(nginxStr, "pid /tmp/nginx.pid;") {
		t.Errorf("nginx.conf missing 'pid /tmp/nginx.pid;'")
	}
	if !strings.Contains(nginxStr, "client_body_temp_path /tmp/client_temp;") {
		t.Errorf("nginx.conf missing client_body_temp_path in /tmp")
	}
	if !strings.Contains(nginxStr, "try_files $uri $uri/ /index.html;") {
		t.Errorf("nginx.conf missing SPA fallback 'try_files $uri $uri/ /index.html;'")
	}
	if !strings.Contains(nginxStr, "location = /healthz") && !strings.Contains(nginxStr, "location /healthz") {
		t.Errorf("nginx.conf missing frontend health endpoint location")
	}
	if strings.Contains(nginxStr, "proxy_pass") {
		t.Errorf("nginx.conf must be static-only and must not contain backend proxy_pass directives")
	}
	if strings.Contains(nginxStr, "location /api/") {
		t.Errorf("nginx.conf must not contain obsolete backend proxy location /api/")
	}
	if strings.Contains(nginxStr, "location /readyz") {
		t.Errorf("nginx.conf must not contain obsolete backend proxy location /readyz")
	}
}

func TestFrontendDockerfileUnprivilegedNonRootSafety(t *testing.T) {
	dockerfilePaths := []string{
		filepath.Join("..", "..", "Dockerfile.frontend"),
		filepath.Join("Dockerfile.frontend"),
	}

	var content []byte
	var err error
	for _, p := range dockerfilePaths {
		content, err = os.ReadFile(p)
		if err == nil {
			break
		}
	}
	if err != nil {
		t.Fatalf("failed to read Dockerfile.frontend: %v", err)
	}

	dfStr := string(content)
	if !strings.Contains(dfStr, "USER nginx") {
		t.Errorf("Dockerfile.frontend missing 'USER nginx' unprivileged user directive")
	}
	if !strings.Contains(dfStr, "EXPOSE 8080 8443") {
		t.Errorf("Dockerfile.frontend missing unprivileged port 'EXPOSE 8080 8443'")
	}
}

func TestDevHandlerDirectInvocationFailClosed(t *testing.T) {
	// Scenario: Even if routes are mounted, DevHandler must reject requests when Environment is production
	prodCfg := &config.Config{
		Environment:        "production",
		EnableDevEndpoints: false,
		JWTSecret:          "secret-key-32-chars-minimum-length!",
		JWTExpiry:          1 * time.Hour,
	}

	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	linkRepo := &mockLinkRepo{}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager(prodCfg.JWTSecret, prodCfg.JWTExpiry)

	devHandler := handler.NewDevHandler(nil, userRepo, walletRepo, entryRepo, linkRepo, auditRepo, jwtMgr, prodCfg)

	r := gin.New()
	r.POST("/dev/session", devHandler.CreateSession)
	r.POST("/dev/fixtures/reset", devHandler.ResetFixtures)
	r.POST("/dev/fixtures/seed", devHandler.SeedFixtures)
	r.GET("/dev/status", devHandler.Status)

	endpoints := []struct {
		method string
		path   string
		body   string
	}{
		{"POST", "/dev/session", `{"username":"dev_user","role":"user"}`},
		{"POST", "/dev/fixtures/reset", `{}`},
		{"POST", "/dev/fixtures/seed", `{}`},
		{"GET", "/dev/status", ``},
	}

	for _, ep := range endpoints {
		w := httptest.NewRecorder()
		var req *http.Request
		if ep.body != "" {
			req, _ = http.NewRequest(ep.method, ep.path, strings.NewReader(ep.body))
			req.Header.Set("Content-Type", "application/json")
		} else {
			req, _ = http.NewRequest(ep.method, ep.path, nil)
		}
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for endpoint %s in production, got %d: %s", ep.path, w.Code, w.Body.String())
		}
	}
}

func TestDevFixturesSeedHandler(t *testing.T) {
	cfg := &config.Config{
		Environment:        "development",
		EnableDevEndpoints: true,
		JWTSecret:          "secret-key-32-chars-minimum-length!",
		JWTExpiry:          1 * time.Hour,
	}

	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	linkRepo := &mockLinkRepo{}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)

	devHandler := handler.NewDevHandler(nil, userRepo, walletRepo, entryRepo, linkRepo, auditRepo, jwtMgr, cfg)

	r := gin.New()
	dev := r.Group("/api/dev")
	{
		dev.POST("/fixtures/seed", devHandler.SeedFixtures)
	}

	body := `{"scenario":"standard"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/dev/fixtures/seed", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for seed fixtures, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal seed fixtures response: %v", err)
	}

	// Verify no tokens or plaintext passwords in response
	if resp["token"] != nil {
		t.Errorf("seed response should never return a session token, got: %v", resp["token"])
	}
	if resp["password"] != nil {
		t.Errorf("seed response should never return plaintext passwords, got: %v", resp["password"])
	}

	// Verify test users seeded with random unguessable passwords
	creator, err := userRepo.GetByUsername(context.Background(), "test_creator")
	if err != nil || creator == nil {
		t.Fatalf("expected test_creator to be seeded")
	}
	if auth.CheckPassword("", creator.PasswordHash) || auth.CheckPassword("password", creator.PasswordHash) || auth.CheckPassword("test_creator", creator.PasswordHash) {
		t.Errorf("fixture password should not match predictable or empty strings")
	}

	owner, err := userRepo.GetByUsername(context.Background(), "test_owner")
	if err != nil || owner == nil {
		t.Fatalf("expected test_owner to be seeded")
	}
	if auth.CheckPassword("", owner.PasswordHash) || auth.CheckPassword("password", owner.PasswordHash) || auth.CheckPassword("test_owner", owner.PasswordHash) {
		t.Errorf("fixture password should not match predictable or empty strings")
	}

	admin, err := userRepo.GetByUsername(context.Background(), "test_admin")
	if err != nil || admin == nil {
		t.Fatalf("expected test_admin to be seeded")
	}
	if auth.CheckPassword("", admin.PasswordHash) || auth.CheckPassword("password", admin.PasswordHash) || auth.CheckPassword("test_admin", admin.PasswordHash) {
		t.Errorf("fixture password should not match predictable or empty strings")
	}
}

// -----------------------------------------------------------------------------
// F1 Remediation Tests: Sesi Belanja (Batch Entry Creation & Autocomplete Suggestions)
// -----------------------------------------------------------------------------

func TestF1_BatchEntryCreationAndItemSuggestions(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	auditRepo := &mockAuditRepo{}

	creatorID := uuid.New()
	otherUserID := uuid.New()

	wallet1 := &model.Wallet{ID: uuid.New(), Name: "Rendy - Kopi", CreatorID: creatorID}
	wallet2 := &model.Wallet{ID: uuid.New(), Name: "Rendy - Makan", CreatorID: creatorID}
	otherWallet := &model.Wallet{ID: uuid.New(), Name: "Other Wallet", CreatorID: otherUserID}

	walletRepo.wallets[wallet1.ID] = wallet1
	walletRepo.wallets[wallet2.ID] = wallet2
	walletRepo.wallets[otherWallet.ID] = otherWallet

	entrySvc := service.NewEntryService(entryRepo, walletRepo, auditRepo)

	// 1. Batch creation of multiple rows in one session by creator
	batchReq := model.BatchEntriesRequest{
		Entries: []model.BatchEntryItem{
			{
				WalletID: wallet1.ID,
				Type:     model.EntryTypeTitipan,
				Amount:   25000,
				ItemName: "Americano",
				Note:     "Less sugar",
			},
			{
				WalletID: wallet2.ID,
				Type:     model.EntryTypeTitipan,
				Amount:   50000,
				ItemName: "Nasi Padang",
				Note:     "Ayam bakar",
			},
		},
	}

	resp, err := entrySvc.CreateBatchEntries(context.Background(), creatorID, model.RoleUser, batchReq)
	if err != nil {
		t.Fatalf("expected batch creation to succeed, got error: %v", err)
	}
	if resp.Count != 2 {
		t.Errorf("expected count 2, got %d", resp.Count)
	}
	if resp.TotalAmount != -75000 {
		t.Errorf("expected total amount -75000, got %d", resp.TotalAmount)
	}

	// 2. Batch creation rejected if any wallet does not belong to creator
	badBatchReq := model.BatchEntriesRequest{
		Entries: []model.BatchEntryItem{
			{
				WalletID: wallet1.ID,
				Type:     model.EntryTypeTitipan,
				Amount:   20000,
				ItemName: "Latte",
			},
			{
				WalletID: otherWallet.ID, // Not owned by creatorID
				Type:     model.EntryTypeTitipan,
				Amount:   30000,
				ItemName: "Bakmi",
			},
		},
	}

	_, err = entrySvc.CreateBatchEntries(context.Background(), creatorID, model.RoleUser, badBatchReq)
	if err == nil {
		t.Fatalf("expected error when batch contains unauthorized wallet, got nil")
	}

	// 3. Autocomplete / item suggestions for wallet1
	suggestions, err := entrySvc.GetItemSuggestions(context.Background(), wallet1.ID, creatorID, model.RoleUser, "", 10)
	if err != nil {
		t.Fatalf("expected item suggestions to succeed, got %v", err)
	}
	if len(suggestions) != 1 || suggestions[0].ItemName != "Americano" {
		t.Errorf("expected suggestion 'Americano', got: %+v", suggestions)
	}
	if suggestions[0].LastPrice != 25000 {
		t.Errorf("expected last price 25000, got %d", suggestions[0].LastPrice)
	}
}

// -----------------------------------------------------------------------------
// F3 Remediation Tests: Transaksi Koreksi & Creator-Only Ledger Writes
// -----------------------------------------------------------------------------

func TestF3_CreatorOnlyLedgerWritesAndCorrection(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	auditRepo := &mockAuditRepo{}

	creatorID := uuid.New()
	ownerID := uuid.New()
	adminID := uuid.New()

	wallet1 := &model.Wallet{ID: uuid.New(), Name: "Dompet Makan", CreatorID: creatorID, OwnerID: &ownerID}
	wallet2 := &model.Wallet{ID: uuid.New(), Name: "Dompet Snack", CreatorID: creatorID}
	walletRepo.wallets[wallet1.ID] = wallet1
	walletRepo.wallets[wallet2.ID] = wallet2

	entrySvc := service.NewEntryService(entryRepo, walletRepo, auditRepo)

	// 1. Owner attempts to write titipan -> MUST BE REJECTED (403 / permission denied)
	_, _, err := entrySvc.CreateEntry(context.Background(), ownerID, model.RoleUser, service.CreateEntryRequest{
		WalletID: wallet1.ID,
		Type:     model.EntryTypeTitipan,
		Amount:   50000,
		ItemName: "Nasi Ayam",
	})
	if err != service.ErrWalletPermissionDenied {
		t.Fatalf("expected ErrWalletPermissionDenied for owner financial write, got: %v", err)
	}

	// 2. Admin attempts to write titipan -> MUST BE REJECTED
	_, _, err = entrySvc.CreateEntry(context.Background(), adminID, model.RoleAdmin, service.CreateEntryRequest{
		WalletID: wallet1.ID,
		Type:     model.EntryTypeTitipan,
		Amount:   50000,
		ItemName: "Nasi Ayam",
	})
	if err != service.ErrWalletPermissionDenied {
		t.Fatalf("expected ErrWalletPermissionDenied for admin financial write, got: %v", err)
	}

	// 3. Creator writes titipan -> SUCCESS
	origEntry, _, err := entrySvc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID: wallet1.ID,
		Type:     model.EntryTypeTitipan,
		Amount:   50000,
		ItemName: "Nasi Uduk",
	})
	if err != nil {
		t.Fatalf("expected creator entry creation to succeed, got: %v", err)
	}

	// 4. Creator corrects titipan with nominal yang benar (final nominal 40000)
	corrEntry, _, err := entrySvc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         wallet1.ID,
		Type:             model.EntryTypeKoreksi,
		Amount:           40000, // Final nominal yang benar
		ItemName:         "Nasi Uduk",
		CorrectsEntryID:  &origEntry.ID,
		CorrectionReason: "Salah input harga awal",
	})
	if err != nil {
		t.Fatalf("expected correction creation to succeed, got: %v", err)
	}
	if corrEntry.Amount != 10000 {
		t.Errorf("expected correction delta amount 10000, got %d", corrEntry.Amount)
	}
	if *corrEntry.CorrectsEntryID != origEntry.ID {
		t.Errorf("expected corrects_entry_id to match original entry ID")
	}

	// 5. Move entry to another creator wallet ("Pindahkan ke dompet lain")
	// Must preserve effective current value (40000) rather than obsolete original nominal (50000)
	srcCorr, dstNew, err := entrySvc.MoveEntry(context.Background(), creatorID, model.RoleUser, service.MoveEntryRequest{
		SourceWalletID: wallet1.ID,
		TargetWalletID: wallet2.ID,
		EntryID:        origEntry.ID,
		Notes:          "Salah pilih dompet",
	})
	if err != nil {
		t.Fatalf("expected move entry to succeed, got: %v", err)
	}
	if srcCorr.Amount != 40000 {
		t.Errorf("expected source correction amount 40000 (offsetting effective value), got %d", srcCorr.Amount)
	}
	if dstNew.Amount != -40000 {
		t.Errorf("expected destination new entry amount -40000 (preserving effective value), got %d", dstNew.Amount)
	}
	if dstNew.WalletID != wallet2.ID {
		t.Errorf("expected target entry in wallet2, got %s", dstNew.WalletID)
	}
}

// -----------------------------------------------------------------------------
// F6 Remediation Tests: Linking Pemilik & Creator Unlink Owner
// -----------------------------------------------------------------------------

func TestF6_OwnerLinkingAndUnlinking(t *testing.T) {
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	linkRepo := &mockLinkRepo{reqs: make(map[uuid.UUID]*model.LinkRequest)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	auditRepo := &mockAuditRepo{}

	creator := &model.User{ID: uuid.New(), Username: "rahmat_ob", Role: model.RoleUser, TokenVersion: 1}
	owner := &model.User{ID: uuid.New(), Username: "rendy_penitip", Role: model.RoleUser, TokenVersion: 1}
	_ = userRepo.Create(context.Background(), creator)
	_ = userRepo.Create(context.Background(), owner)

	wallet := &model.Wallet{ID: uuid.New(), Name: "Rendy - Kopi", CreatorID: creator.ID}
	walletRepo.wallets[wallet.ID] = wallet

	linkSvc := service.NewLinkService(linkRepo, walletRepo, userRepo, auditRepo)
	walletSvc := service.NewWalletService(walletRepo, userRepo, entryRepo, auditRepo)

	// 1. Creator requests link to owner username
	linkReq, err := linkSvc.CreateLinkRequest(context.Background(), creator.ID, wallet.ID, owner.Username)
	if err != nil {
		t.Fatalf("expected create link request to succeed, got: %v", err)
	}
	if linkReq.Status != model.LinkRequestStatusPending {
		t.Errorf("expected status pending, got %s", linkReq.Status)
	}

	// 2. Owner approves link request -> wallet owner set
	approvedReq, err := linkSvc.ApproveLinkRequest(context.Background(), owner.ID, linkReq.ID)
	if err != nil {
		t.Fatalf("expected approve link request to succeed, got: %v", err)
	}
	if approvedReq.Status != model.LinkRequestStatusApproved {
		t.Errorf("expected status approved, got %s", approvedReq.Status)
	}
	if wallet.OwnerID == nil || *wallet.OwnerID != owner.ID {
		t.Errorf("expected wallet owner to be set to %s", owner.ID)
	}

	// 3. Owner attempts to rename or archive wallet -> MUST BE DENIED
	err = walletSvc.UpdateWalletName(context.Background(), wallet.ID, owner.ID, model.RoleUser, "Hacked Name")
	if err != service.ErrWalletPermissionDenied {
		t.Errorf("expected ErrWalletPermissionDenied for owner renaming wallet, got: %v", err)
	}
	err = walletSvc.SetWalletArchived(context.Background(), wallet.ID, owner.ID, model.RoleUser, true)
	if err != service.ErrWalletPermissionDenied {
		t.Errorf("expected ErrWalletPermissionDenied for owner archiving wallet, got: %v", err)
	}

	// 4. Creator disconnects / unlinks owner -> owner is removed, wallet intact
	err = walletSvc.UnlinkWallet(context.Background(), wallet.ID, creator.ID, model.RoleUser)
	if err != nil {
		t.Fatalf("expected unlink wallet to succeed, got: %v", err)
	}
	if wallet.OwnerID != nil {
		t.Errorf("expected wallet owner_id to be nil after unlink")
	}

	// 5. Former owner has no permission on wallet after unlink
	authz, _ := walletRepo.IsUserAuthorized(context.Background(), wallet.ID, owner.ID)
	if authz {
		t.Errorf("expected former owner to no longer be authorized after unlink")
	}
}

// -----------------------------------------------------------------------------
// F8 Remediation Tests: Insight Pembuat (Money Outside & Trends)
// -----------------------------------------------------------------------------

func TestF8_CreatorInsightsAndTrends(t *testing.T) {
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	auditRepo := &mockAuditRepo{}

	creatorID := uuid.New()

	w1 := &model.Wallet{ID: uuid.New(), Name: "Buku 1", CreatorID: creatorID, Balance: -75000}
	w2 := &model.Wallet{ID: uuid.New(), Name: "Buku 2", CreatorID: creatorID, Balance: -25000}
	w3 := &model.Wallet{ID: uuid.New(), Name: "Buku 3 Arsip", CreatorID: creatorID, Balance: -50000}
	now := time.Now()
	w3.ArchivedAt = &now

	walletRepo.wallets[w1.ID] = w1
	walletRepo.wallets[w2.ID] = w2
	walletRepo.wallets[w3.ID] = w3

	walletSvc := service.NewWalletService(walletRepo, userRepo, entryRepo, auditRepo)

	insights, err := walletSvc.GetCreatorInsights(context.Background(), creatorID, "month")
	if err != nil {
		t.Fatalf("expected GetCreatorInsights to succeed, got: %v", err)
	}

	if insights.TotalOutstanding != 100000 {
		t.Errorf("expected total money outside 100000, got %d", insights.TotalOutstanding)
	}
	if insights.TotalActiveWallets != 2 {
		t.Errorf("expected 2 active wallets, got %d", insights.TotalActiveWallets)
	}
	if insights.TotalArchivedWallets != 1 {
		t.Errorf("expected 1 archived wallet, got %d", insights.TotalArchivedWallets)
	}
}

// -----------------------------------------------------------------------------
// F10 Remediation Tests: Token Renewal & Session Revocation
// -----------------------------------------------------------------------------

func TestF10_AuthRenewAndTokenRevocation(t *testing.T) {
	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager("test-secret-key-32-chars-minimum-length!", 72*time.Hour)

	authSvc := service.NewAuthService(userRepo, auditRepo, jwtMgr)

	// 1. Register user
	userResp, token, expiresAt, err := authSvc.Register(context.Background(), "test_user_f10", "Secret123!")
	if err != nil {
		t.Fatalf("expected register to succeed, got: %v", err)
	}
	if token == "" {
		t.Errorf("expected valid JWT token")
	}
	if expiresAt.Before(time.Now().Add(71 * time.Hour)) {
		t.Errorf("expected expiry in ~72 hours, got: %v", expiresAt)
	}

	// 2. Renew token
	renewedUser, newToken, newExpiresAt, err := authSvc.RenewToken(context.Background(), userResp.ID, 1)
	if err != nil {
		t.Fatalf("expected token renewal to succeed, got: %v", err)
	}
	if renewedUser.Username != "test_user_f10" {
		t.Errorf("expected username test_user_f10, got %s", renewedUser.Username)
	}
	if newToken == "" || newExpiresAt.IsZero() {
		t.Errorf("expected valid renewed token and expiresAt")
	}

	// 3. User changes password -> token_version incremented
	err = authSvc.ResetPassword(context.Background(), userResp.ID, "NewSecret456!")
	if err != nil {
		t.Fatalf("expected password change to succeed, got: %v", err)
	}

	// 4. Old token version (1) is now REVOKED when checked
	_, err = authSvc.GetCurrentUser(context.Background(), userResp.ID, 1)
	if err != service.ErrTokenRevoked {
		t.Errorf("expected ErrTokenRevoked for old token_version, got: %v", err)
	}

	// 5. Admin reset password also revokes token
	adminID := uuid.New()
	err = authSvc.AdminResetPassword(context.Background(), adminID, "test_user_f10", "AdminSecret789!")
	if err != nil {
		t.Fatalf("expected admin password reset to succeed, got: %v", err)
	}
	_, err = authSvc.GetCurrentUser(context.Background(), userResp.ID, 2)
	if err != service.ErrTokenRevoked {
		t.Errorf("expected ErrTokenRevoked after admin reset password, got: %v", err)
	}
}

func TestF10_SelfServiceAuthenticatedPasswordChange(t *testing.T) {
	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager("test-secret-key-32-chars-minimum-length!", 72*time.Hour)

	authSvc := service.NewAuthService(userRepo, auditRepo, jwtMgr)

	// 1. Register user
	userResp, token, _, err := authSvc.Register(context.Background(), "change_pw_user", "OriginalSecret123!")
	if err != nil {
		t.Fatalf("expected register to succeed, got: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	// 2. Change password with wrong current password -> must fail with ErrInvalidCredentials
	err = authSvc.ChangePassword(context.Background(), userResp.ID, "WrongPassword!", "NewValidSecret456!")
	if !errors.Is(err, service.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for wrong current password, got: %v", err)
	}

	// 3. Change password with too short new password (< 6 chars) -> must fail
	err = authSvc.ChangePassword(context.Background(), userResp.ID, "OriginalSecret123!", "123")
	if err == nil {
		t.Errorf("expected error for short new password, got nil")
	}

	// 4. Change password with empty current password -> must fail
	err = authSvc.ChangePassword(context.Background(), userResp.ID, "", "NewValidSecret456!")
	if err == nil {
		t.Errorf("expected error for empty current password, got nil")
	}

	// 5. Successful self-service password change
	err = authSvc.ChangePassword(context.Background(), userResp.ID, "OriginalSecret123!", "NewValidSecret456!")
	if err != nil {
		t.Fatalf("expected ChangePassword to succeed, got: %v", err)
	}

	// 6. Old token version (1) is revoked
	_, err = authSvc.GetCurrentUser(context.Background(), userResp.ID, 1)
	if !errors.Is(err, service.ErrTokenRevoked) {
		t.Errorf("expected ErrTokenRevoked for old token version, got: %v", err)
	}

	// 7. Login with old password fails
	_, _, _, err = authSvc.Login(context.Background(), "change_pw_user", "OriginalSecret123!")
	if !errors.Is(err, service.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for old password login, got: %v", err)
	}

	// 8. Login with new password succeeds
	newResp, newToken, _, err := authSvc.Login(context.Background(), "change_pw_user", "NewValidSecret456!")
	if err != nil {
		t.Fatalf("expected login with new password to succeed, got: %v", err)
	}
	if newResp.Username != "change_pw_user" {
		t.Errorf("expected username change_pw_user, got %s", newResp.Username)
	}
	if newToken == "" {
		t.Error("expected valid token from new login")
	}

	// 9. Current user with new token version 2 succeeds
	currentUser, err := authSvc.GetCurrentUser(context.Background(), userResp.ID, 2)
	if err != nil {
		t.Fatalf("expected GetCurrentUser with token version 2 to succeed, got: %v", err)
	}
	if currentUser.TokenVersion != 2 {
		t.Errorf("expected token_version 2, got %d", currentUser.TokenVersion)
	}
	if currentUser.Username != "change_pw_user" {
		t.Errorf("expected username change_pw_user, got %s", currentUser.Username)
	}

	// 10. Verify audit log entry
	foundAudit := false
	for _, l := range auditRepo.logs {
		if l.Action == string(model.AuditActionUserPasswordChange) && *l.ActorID == userResp.ID {
			foundAudit = true
			break
		}
	}
	if !foundAudit {
		t.Errorf("expected audit log entry with action %s", model.AuditActionUserPasswordChange)
	}
}

func TestF10_ChangePasswordAPIHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	auditRepo := &mockAuditRepo{}
	jwtMgr := auth.NewJWTManager("test-secret-key-32-chars-minimum-length!", 72*time.Hour)
	cfg := &config.Config{
		JWTSecret:    "test-secret-key-32-chars-minimum-length!",
		JWTExpiry:    72 * time.Hour,
		CookieSecure: false,
		CookieDomain: "",
	}

	authSvc := service.NewAuthService(userRepo, auditRepo, jwtMgr)
	authHandler := handler.NewAuthHandler(authSvc, cfg)

	userResp, token, _, err := authSvc.Register(context.Background(), "api_pw_user", "OldSecret123!")
	if err != nil {
		t.Fatalf("setup user registration failed: %v", err)
	}

	r := gin.New()
	authRequired := r.Group("/api")
	authRequired.Use(middleware.AuthMiddleware(jwtMgr, authSvc))
	authRequired.POST("/auth/change-password", authHandler.ChangePassword)

	// Case 1: Unauthenticated request -> 401
	w1 := httptest.NewRecorder()
	body1, _ := json.Marshal(map[string]string{
		"current_password": "OldSecret123!",
		"new_password":     "BrandNewPass123!",
	})
	req1, _ := http.NewRequest("POST", "/api/auth/change-password", bytes.NewReader(body1))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauthenticated request, got %d", w1.Code)
	}

	// Case 2: Wrong current password -> 400
	w2 := httptest.NewRecorder()
	body2, _ := json.Marshal(map[string]string{
		"current_password": "WrongPassword!",
		"new_password":     "BrandNewPass123!",
	})
	req2, _ := http.NewRequest("POST", "/api/auth/change-password", bytes.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for wrong current password, got %d: %s", w2.Code, w2.Body.String())
	}

	// Case 3: Valid change password -> 200
	w3 := httptest.NewRecorder()
	body3, _ := json.Marshal(map[string]string{
		"current_password": "OldSecret123!",
		"new_password":     "BrandNewPass123!",
	})
	req3, _ := http.NewRequest("POST", "/api/auth/change-password", bytes.NewReader(body3))
	req3.Header.Set("Content-Type", "application/json")
	req3.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Errorf("expected 200 for valid change password, got %d: %s", w3.Code, w3.Body.String())
	}

	// Verify old token is now rejected by middleware (session revoked)
	w4 := httptest.NewRecorder()
	req4, _ := http.NewRequest("POST", "/api/auth/change-password", bytes.NewReader(body3))
	req4.Header.Set("Content-Type", "application/json")
	req4.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w4, req4)
	if w4.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 with old token after password change, got %d", w4.Code)
	}

	_ = userResp
}
