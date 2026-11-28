package handler

import (
	"context"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
)

func paginationContext(query string) *gin.Context {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("GET", "/?"+query, nil)
	return c
}

func TestParsePagination(t *testing.T) {
	tests := []struct {
		name, query   string
		limit, offset int
	}{
		{"defaults", "", 50, 0},
		{"invalid", "limit=nope&offset=nope", 50, 0},
		{"zero", "limit=0&offset=0", 50, 0},
		{"negative", "limit=-2&offset=-4", 50, 0},
		{"cap", "limit=500&offset=9", 200, 9},
		{"offset exact max", "offset=" + strconv.Itoa(maxPaginationOffset), 50, maxPaginationOffset},
		{"offset max plus one", "offset=" + strconv.Itoa(maxPaginationOffset+1), 50, maxPaginationOffset},
		{"offset max int", "offset=" + strconv.Itoa(math.MaxInt), 50, maxPaginationOffset},
		{"offset overflow", "offset=99999999999999999999999999", 50, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			limit, offset := parsePagination(paginationContext(tt.query), 50, 200)
			if limit != tt.limit || offset != tt.offset {
				t.Fatalf("got (%d,%d), want (%d,%d)", limit, offset, tt.limit, tt.offset)
			}
		})
	}
}

func TestParseAdminFilterPagination(t *testing.T) {
	h := &AdminHandler{}
	cases := []struct {
		query         string
		limit, offset int
	}{
		{"limit=bad&page=3", 50, 100},
		{"limit=0&page=2", 50, 50},
		{"limit=-1&page=1", 50, 0},
		{"", 50, 0},
		{"limit=500&page=2", 200, 200},
		{"limit=1&page=2", 1, 1},
		{"limit=200&page=2", 200, 200},
		{"limit=201&page=2", 200, 200},
		{"page=bad", 50, 0},
		{"page=0", 50, 0},
		{"page=-2", 50, 0},
		{"page=" + strconv.Itoa(maxPaginationOffset/50+1) + "&limit=50", 50, maxPaginationOffset},
		{"page=" + strconv.Itoa(maxPaginationOffset/50+2) + "&limit=50", 50, maxPaginationOffset},
		{"page=" + strconv.Itoa(maxPaginationOffset/3+1) + "&limit=3", 3, (maxPaginationOffset / 3) * 3},
		{"page=" + strconv.Itoa(maxPaginationOffset/3+2) + "&limit=3", 3, maxPaginationOffset},
		{"page=" + strconv.Itoa(math.MaxInt) + "&limit=50", 50, maxPaginationOffset},
		{"page=99999999999999999999999999&limit=50", 50, 0},
		{"limit=10&page=9&offset=17", 10, 17},
		{"limit=10&page=9&offset=-4", 10, 0},
		{"limit=10&page=9&offset=bad", 10, 0},
		{"page=9&offset=", 50, 0},
		{"page=2&offset=abc", 50, 0},
		{"page=2&offset=-5", 50, 0},
		{"offset=" + strconv.Itoa(maxPaginationOffset), 50, maxPaginationOffset},
		{"offset=" + strconv.Itoa(maxPaginationOffset+1), 50, maxPaginationOffset},
		{"offset=" + strconv.Itoa(math.MaxInt), 50, maxPaginationOffset},
		{"offset=99999999999999999999999999", 50, 0},
	}
	for _, tc := range cases {
		filter := h.parseAdminFilter(paginationContext(tc.query))
		if filter.Limit != tc.limit || filter.Offset != tc.offset {
			t.Errorf("%q: got (%d,%d), want (%d,%d)", tc.query, filter.Limit, filter.Offset, tc.limit, tc.offset)
		}
	}
}

type stubAdminUserRepo struct {
	repository.UserRepository
	captured repository.AdminUserFilter
	called   bool
}

func (s *stubAdminUserRepo) ListFiltered(_ context.Context, filter repository.AdminUserFilter) ([]model.User, int64, error) {
	s.called = true
	s.captured = filter
	return []model.User{}, 0, nil
}

type stubAdminWalletRepo struct {
	repository.WalletRepository
	captured repository.AdminWalletFilter
	called   bool
}

func (s *stubAdminWalletRepo) ListAllFiltered(_ context.Context, filter repository.AdminWalletFilter) ([]model.Wallet, int64, error) {
	s.called = true
	s.captured = filter
	return []model.Wallet{}, 0, nil
}

type stubAdminEntryRepo struct {
	repository.EntryRepository
	capturedEntry   repository.AdminEntryFilter
	capturedCreator repository.AdminCreatorFilter
	entryCalled     bool
	creatorCalled   bool
}

func (s *stubAdminEntryRepo) ListAdminEntries(_ context.Context, filter repository.AdminEntryFilter) ([]model.Entry, int64, *model.AdminPeriodSummary, error) {
	s.entryCalled = true
	s.capturedEntry = filter
	return []model.Entry{}, 0, &model.AdminPeriodSummary{}, nil
}

func (s *stubAdminEntryRepo) GetAdminCreatorsFiltered(_ context.Context, filter repository.AdminCreatorFilter) ([]model.AdminCreatorDetail, error) {
	s.creatorCalled = true
	s.capturedCreator = filter
	return []model.AdminCreatorDetail{}, nil
}

type stubAdminAuditRepo struct {
	repository.AuditRepository
	captured repository.AuditLogFilter
	called   bool
}

func (s *stubAdminAuditRepo) List(_ context.Context, filter repository.AuditLogFilter) ([]model.AuditLog, int64, error) {
	s.called = true
	s.captured = filter
	return []model.AuditLog{}, 0, nil
}

func TestAdminListUsersFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("search and valid role", func(t *testing.T) {
		repo := &stubAdminUserRepo{}
		h := NewAdminHandler(repo, nil, nil, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/users?search=+alice+&role=admin&limit=20&offset=5", nil)

		h.ListUsers(c)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if !repo.called {
			t.Fatal("expected ListFiltered to be called")
		}
		if repo.captured.Search != "alice" {
			t.Errorf("search = %q, want %q", repo.captured.Search, "alice")
		}
		if repo.captured.Role == nil || *repo.captured.Role != model.RoleAdmin {
			t.Errorf("role = %v, want admin", repo.captured.Role)
		}
		if repo.captured.Limit != 20 || repo.captured.Offset != 5 {
			t.Errorf("pagination = (%d,%d), want (20,5)", repo.captured.Limit, repo.captured.Offset)
		}
	})

	t.Run("q alias and role user", func(t *testing.T) {
		repo := &stubAdminUserRepo{}
		h := NewAdminHandler(repo, nil, nil, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/users?q=bob&role=user", nil)

		h.ListUsers(c)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if repo.captured.Search != "bob" {
			t.Errorf("search = %q, want %q", repo.captured.Search, "bob")
		}
		if repo.captured.Role == nil || *repo.captured.Role != model.RoleUser {
			t.Errorf("role = %v, want user", repo.captured.Role)
		}
	})

	t.Run("invalid role returns 400", func(t *testing.T) {
		repo := &stubAdminUserRepo{}
		h := NewAdminHandler(repo, nil, nil, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/users?role=superadmin", nil)

		h.ListUsers(c)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", w.Code)
		}
		if repo.called {
			t.Error("expected ListFiltered not to be called on invalid role")
		}
	})
}

func TestAdminListWalletsFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("search status and linked", func(t *testing.T) {
		repo := &stubAdminWalletRepo{}
		h := NewAdminHandler(nil, repo, nil, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/wallets?search=kopi&status=active&linked=unlinked&limit=10&offset=2", nil)

		h.ListWallets(c)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if !repo.called {
			t.Fatal("expected ListAllFiltered to be called")
		}
		if repo.captured.Search != "kopi" || repo.captured.Status != "active" || repo.captured.Linked != "unlinked" {
			t.Errorf("captured = %+v", repo.captured)
		}
		if repo.captured.Limit != 10 || repo.captured.Offset != 2 {
			t.Errorf("pagination = (%d,%d), want (10,2)", repo.captured.Limit, repo.captured.Offset)
		}
	})

	t.Run("q alias archived linked", func(t *testing.T) {
		repo := &stubAdminWalletRepo{}
		h := NewAdminHandler(nil, repo, nil, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/wallets?q=sarapan&status=archived&linked=linked", nil)

		h.ListWallets(c)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if repo.captured.Search != "sarapan" || repo.captured.Status != "archived" || repo.captured.Linked != "linked" {
			t.Errorf("captured = %+v", repo.captured)
		}
	})

	t.Run("invalid status returns 400", func(t *testing.T) {
		repo := &stubAdminWalletRepo{}
		h := NewAdminHandler(nil, repo, nil, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/wallets?status=deleted", nil)

		h.ListWallets(c)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", w.Code)
		}
		if repo.called {
			t.Error("expected ListAllFiltered not to be called on invalid status")
		}
	})

	t.Run("invalid linked returns 400", func(t *testing.T) {
		repo := &stubAdminWalletRepo{}
		h := NewAdminHandler(nil, repo, nil, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/wallets?linked=maybe", nil)

		h.ListWallets(c)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", w.Code)
		}
		if repo.called {
			t.Error("expected ListAllFiltered not to be called on invalid linked")
		}
	})
}

func TestAdminListEntriesFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("search and q alias", func(t *testing.T) {
		repo := &stubAdminEntryRepo{}
		h := NewAdminHandler(nil, nil, repo, nil, nil)
		walletID := uuid.New()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/entries?search=nasi+padang&type=titipan&wallet_id="+walletID.String(), nil)
		h.ListEntries(c)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if !repo.entryCalled {
			t.Fatal("expected ListAdminEntries to be called")
		}
		if repo.capturedEntry.Search != "nasi padang" {
			t.Errorf("search = %q, want %q", repo.capturedEntry.Search, "nasi padang")
		}
		if repo.capturedEntry.Type == nil || *repo.capturedEntry.Type != model.EntryTypeTitipan {
			t.Errorf("type = %v, want titipan", repo.capturedEntry.Type)
		}
		if repo.capturedEntry.WalletID == nil || *repo.capturedEntry.WalletID != walletID {
			t.Errorf("walletID = %v, want %s", repo.capturedEntry.WalletID, walletID)
		}

		// Test q alias
		w2 := httptest.NewRecorder()
		c2, _ := gin.CreateTestContext(w2)
		c2.Request = httptest.NewRequest(http.MethodGet, "/admin/entries?q=es+teh", nil)
		h.ListEntries(c2)

		if w2.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w2.Code)
		}
		if repo.capturedEntry.Search != "es teh" {
			t.Errorf("search via q = %q, want %q", repo.capturedEntry.Search, "es teh")
		}
	})
}

func TestAdminListCreatorsFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("search and valid status has_outstanding", func(t *testing.T) {
		repo := &stubAdminEntryRepo{}
		h := NewAdminHandler(nil, nil, repo, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/creators?search=budi&status=has_outstanding", nil)

		h.ListCreators(c)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if !repo.creatorCalled {
			t.Fatal("expected GetAdminCreatorsFiltered to be called")
		}
		if repo.capturedCreator.Search != "budi" || repo.capturedCreator.Status != "has_outstanding" {
			t.Errorf("captured = %+v", repo.capturedCreator)
		}
	})

	t.Run("q alias and status has_active_wallets", func(t *testing.T) {
		repo := &stubAdminEntryRepo{}
		h := NewAdminHandler(nil, nil, repo, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/creators?q=siti&status=has_active_wallets", nil)

		h.ListCreators(c)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if repo.capturedCreator.Search != "siti" || repo.capturedCreator.Status != "has_active_wallets" {
			t.Errorf("captured = %+v", repo.capturedCreator)
		}
	})

	t.Run("invalid status returns 400", func(t *testing.T) {
		repo := &stubAdminEntryRepo{}
		h := NewAdminHandler(nil, nil, repo, nil, nil)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/creators?status=unknown", nil)

		h.ListCreators(c)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", w.Code)
		}
		if repo.creatorCalled {
			t.Error("expected GetAdminCreatorsFiltered not to be called on invalid status")
		}
	})
}

func TestAdminListAuditLogsFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("search and filters", func(t *testing.T) {
		repo := &stubAdminAuditRepo{}
		h := NewAdminHandler(nil, nil, nil, repo, nil)
		actorID := uuid.New()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/audit-logs?search=promote&action=USER_PROMOTE&target_type=user&actor_id="+actorID.String(), nil)
		h.ListAuditLogs(c)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if !repo.called {
			t.Fatal("expected audit List to be called")
		}
		if repo.captured.Search != "promote" || repo.captured.Action != "USER_PROMOTE" || repo.captured.TargetType != "user" {
			t.Errorf("captured = %+v", repo.captured)
		}
		if repo.captured.ActorID == nil || *repo.captured.ActorID != actorID {
			t.Errorf("actorID = %v, want %s", repo.captured.ActorID, actorID)
		}
	})

	t.Run("q alias", func(t *testing.T) {
		repo := &stubAdminAuditRepo{}
		h := NewAdminHandler(nil, nil, nil, repo, nil)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/admin/audit-logs?q=reset_password", nil)
		h.ListAuditLogs(c)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if repo.captured.Search != "reset_password" {
			t.Errorf("search via q = %q, want %q", repo.captured.Search, "reset_password")
		}
	})
}
