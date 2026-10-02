package tests

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/auth"
	"github.com/nyuuk/nebengbeli/internal/handler"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/repository"
	"github.com/nyuuk/nebengbeli/internal/service"
)

// =============================================================================
// F3 Correction API Contract Tests
// =============================================================================

func TestF3_Correction_Contract_FinalNominal_RepeatedCorrections_And_Auth(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	auditRepo := &mockAuditRepo{}

	creatorID := uuid.New()
	otherUserID := uuid.New()

	wallet := &model.Wallet{
		ID:        uuid.New(),
		Name:      "Kantor - Snack",
		CreatorID: creatorID,
	}
	walletRepo.wallets[wallet.ID] = wallet

	svc := service.NewEntryService(entryRepo, walletRepo, auditRepo)

	// 1. Create original titipan of 50,000 IDR
	orig, _, err := svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID: wallet.ID,
		Type:     model.EntryTypeTitipan,
		Amount:   50000,
		ItemName: "Nasi Padang",
	})
	if err != nil {
		t.Fatalf("failed to create original entry: %v", err)
	}

	// 2. Auth Test: Non-creator cannot create correction
	_, _, err = svc.CreateEntry(context.Background(), otherUserID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         wallet.ID,
		Type:             model.EntryTypeKoreksi,
		Amount:           40000,
		CorrectsEntryID:  &orig.ID,
		CorrectionReason: "salah harga",
	})
	if err != service.ErrWalletPermissionDenied {
		t.Errorf("expected ErrWalletPermissionDenied for non-creator, got: %v", err)
	}

	// 3. Reason Validation Test: Reject empty or invalid PRD reason
	_, _, err = svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         wallet.ID,
		Type:             model.EntryTypeKoreksi,
		Amount:           40000,
		CorrectsEntryID:  &orig.ID,
		CorrectionReason: "",
	})
	if err != service.ErrCorrectionReasonRequired {
		t.Errorf("expected ErrCorrectionReasonRequired for empty reason, got: %v", err)
	}

	// 4. First Correction: Final nominal should be 40,000 (delta = 40000 - 50000 = -10000)
	corr1, _, err := svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         wallet.ID,
		Type:             model.EntryTypeKoreksi,
		Amount:           40000, // Final nominal yang benar
		CorrectsEntryID:  &orig.ID,
		CorrectionReason: "salah harga",
	})
	if err != nil {
		t.Fatalf("first correction failed: %v", err)
	}
	if corr1.Amount != 10000 {
		t.Errorf("expected delta 10000, got %d", corr1.Amount)
	}
	if corr1.ItemName != "Nasi Padang" {
		t.Errorf("expected auto-populated item_name 'Nasi Padang', got '%s'", corr1.ItemName)
	}

	// 5. Zero-delta correction rejection: Submitting 40,000 again should fail
	_, _, err = svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         wallet.ID,
		Type:             model.EntryTypeKoreksi,
		Amount:           40000,
		CorrectsEntryID:  &orig.ID,
		CorrectionReason: "salah harga",
	})
	if err != service.ErrCorrectionNoDelta {
		t.Errorf("expected ErrCorrectionNoDelta when nominal unchanged, got: %v", err)
	}

	// 6. Repeated Correction: Second correction on the same original entry
	// Nominal corrected to 35,000 (delta = 35000 - 40000 = -5000)
	target35k := int64(35000)
	corr2, _, err := svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         wallet.ID,
		Type:             model.EntryTypeKoreksi,
		TargetAmount:     &target35k,
		CorrectsEntryID:  &orig.ID,
		CorrectionReason: "lainnya: diskon kupon tambahan",
	})
	if err != nil {
		t.Fatalf("second correction failed: %v", err)
	}
	if corr2.Amount != 5000 {
		t.Errorf("expected delta 5000, got %d", corr2.Amount)
	}

	// Check effective amount of original entry is now -35,000
	updatedOrig, err := entryRepo.GetByID(context.Background(), orig.ID)
	if err != nil {
		t.Fatalf("failed to fetch updated original: %v", err)
	}
	if updatedOrig.EffectiveAmount != -35000 {
		t.Errorf("expected effective amount -35000, got %d", updatedOrig.EffectiveAmount)
	}

	// 7. Cancellation Test: Target final nominal 0 (pembatalan)
	// Delta = 0 - 35000 = -35000
	target0 := int64(0)
	corrCancel, _, err := svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         wallet.ID,
		Type:             model.EntryTypeKoreksi,
		TargetAmount:     &target0,
		CorrectsEntryID:  &orig.ID,
		CorrectionReason: "batal",
	})
	if err != nil {
		t.Fatalf("cancellation correction failed: %v", err)
	}
	if corrCancel.Amount != 35000 {
		t.Errorf("expected cancellation delta 35000, got %d", corrCancel.Amount)
	}

	cancelledOrig, _ := entryRepo.GetByID(context.Background(), orig.ID)
	if cancelledOrig.EffectiveAmount != 0 {
		t.Errorf("expected effective amount 0 after cancellation, got %d", cancelledOrig.EffectiveAmount)
	}

	// 8. Correction-of-correction rejection: Attempting to correct corr1 should be rejected
	_, _, err = svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         wallet.ID,
		Type:             model.EntryTypeKoreksi,
		Amount:           5000,
		CorrectsEntryID:  &corr1.ID,
		CorrectionReason: "salah harga",
	})
	if err != service.ErrCannotCorrectCorrection {
		t.Errorf("expected ErrCannotCorrectCorrection, got: %v", err)
	}
}

func TestF3_TopupCorrection_Contract(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	auditRepo := &mockAuditRepo{}

	creatorID := uuid.New()
	wallet := &model.Wallet{
		ID:        uuid.New(),
		Name:      "Buku Topup",
		CreatorID: creatorID,
	}
	walletRepo.wallets[wallet.ID] = wallet

	svc := service.NewEntryService(entryRepo, walletRepo, auditRepo)

	// 1. Create Topup of 100,000 (signed as +100,000)
	topup, _, err := svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID: wallet.ID,
		Type:     model.EntryTypeTopup,
		Amount:   100000,
		Note:     "Transfer BCA 100k",
	})
	if err != nil {
		t.Fatalf("failed to create topup: %v", err)
	}
	if topup.Amount != 100000 {
		t.Errorf("expected topup amount 100000, got %d", topup.Amount)
	}

	// 2. Correct Topup: nominal was actually 80,000 (target signed +80,000)
	// Delta = (+80,000) - (+100,000) = -20,000
	corrTopup, _, err := svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         wallet.ID,
		Type:             model.EntryTypeKoreksi,
		Amount:           80000,
		CorrectsEntryID:  &topup.ID,
		CorrectionReason: "salah harga",
	})
	if err != nil {
		t.Fatalf("topup correction failed: %v", err)
	}
	if corrTopup.Amount != -20000 {
		t.Errorf("expected topup correction delta -20000, got %d", corrTopup.Amount)
	}

	updatedTopup, _ := entryRepo.GetByID(context.Background(), topup.ID)
	if updatedTopup.EffectiveAmount != 80000 {
		t.Errorf("expected updated topup effective amount 80000, got %d", updatedTopup.EffectiveAmount)
	}
}

// =============================================================================
// F3 Move: Preserving Effective Value & Client-ID Idempotency
// =============================================================================

func TestF3_Move_PreservesEffectiveValue_And_Idempotency(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	auditRepo := &mockAuditRepo{}

	creatorID := uuid.New()
	walletSrc := &model.Wallet{ID: uuid.New(), Name: "Dompet Asal", CreatorID: creatorID}
	walletDst := &model.Wallet{ID: uuid.New(), Name: "Dompet Tujuan", CreatorID: creatorID}
	walletRepo.wallets[walletSrc.ID] = walletSrc
	walletRepo.wallets[walletDst.ID] = walletDst

	svc := service.NewEntryService(entryRepo, walletRepo, auditRepo)

	// 1. Original titipan: 60,000
	orig, _, err := svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID: walletSrc.ID,
		Type:     model.EntryTypeTitipan,
		Amount:   60000,
		ItemName: "Ayam Bakar",
	})
	if err != nil {
		t.Fatalf("failed to create orig: %v", err)
	}

	// 2. Corrected down to 50,000 (delta -10,000)
	_, _, err = svc.CreateEntry(context.Background(), creatorID, model.RoleUser, service.CreateEntryRequest{
		WalletID:         walletSrc.ID,
		Type:             model.EntryTypeKoreksi,
		Amount:           50000,
		CorrectsEntryID:  &orig.ID,
		CorrectionReason: "salah harga",
	})
	if err != nil {
		t.Fatalf("failed to correct: %v", err)
	}

	// 3. Move from walletSrc to walletDst
	// Must reverse 50,000 in walletSrc and create 50,000 in walletDst
	moveClientID := uuid.New()
	corrClientID := uuid.New()
	tgtClientID := uuid.New()

	moveReq := service.MoveEntryRequest{
		ClientID:           &moveClientID,
		CorrectionClientID: &corrClientID,
		TargetClientID:     &tgtClientID,
		SourceWalletID:     walletSrc.ID,
		TargetWalletID:     walletDst.ID,
		EntryID:            orig.ID,
		Notes:              "Pindah ke buku sebelah",
	}

	srcCorr, dstNew, err := svc.MoveEntry(context.Background(), creatorID, model.RoleUser, moveReq)
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}

	if srcCorr.Amount != 50000 {
		t.Errorf("expected source correction amount 50000, got %d", srcCorr.Amount)
	}
	if srcCorr.CorrectionReason != "salah dompet" {
		t.Errorf("expected correction reason 'salah dompet', got '%s'", srcCorr.CorrectionReason)
	}
	if dstNew.Amount != -50000 {
		t.Errorf("expected destination new entry amount -50000, got %d", dstNew.Amount)
	}
	if dstNew.WalletID != walletDst.ID {
		t.Errorf("expected destination wallet %s, got %s", walletDst.ID, dstNew.WalletID)
	}

	// 4. Idempotency test: Replaying move with same client_ids returns existing entries
	replayedCorr, replayedDst, err := svc.MoveEntry(context.Background(), creatorID, model.RoleUser, moveReq)
	if err != nil {
		t.Fatalf("replayed move failed: %v", err)
	}
	if replayedCorr.ID != srcCorr.ID || replayedDst.ID != dstNew.ID {
		t.Errorf("expected identical moved entry instances on idempotent replay")
	}
}

// =============================================================================
// F9 Admin Conformance Tests: Listing, Period Summary, Trends, Creators
// =============================================================================

func TestF9_Admin_Endpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)

	userRepo := &mockUserRepo{users: make(map[string]*model.User), usersByID: make(map[uuid.UUID]*model.User)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	auditRepo := &mockAuditRepo{}

	adminUser := &model.User{ID: uuid.New(), Username: "adnan", Role: model.RoleAdmin, TokenVersion: 1}
	normalUser := &model.User{ID: uuid.New(), Username: "rahmat", Role: model.RoleUser, TokenVersion: 1}
	_ = userRepo.Create(context.Background(), adminUser)
	_ = userRepo.Create(context.Background(), normalUser)

	jwtMgr := auth.NewJWTManager("test-jwt-secret-for-f9-tests-32chars!", 2*time.Hour)
	authSvc := service.NewAuthService(userRepo, auditRepo, jwtMgr)
	adminHandler := handler.NewAdminHandler(userRepo, walletRepo, entryRepo, auditRepo, authSvc)

	// Seed entries
	wallet := &model.Wallet{ID: uuid.New(), Name: "Dompet Admin Test", CreatorID: normalUser.ID}
	walletRepo.wallets[wallet.ID] = wallet

	now := time.Now().UTC()
	entryRepo.entries[uuid.New()] = &model.Entry{
		ID:         uuid.New(),
		ClientID:   uuid.New(),
		WalletID:   wallet.ID,
		Type:       model.EntryTypeTitipan,
		Amount:     -25000,
		ItemName:   "Es Teh",
		CreatedBy:  normalUser.ID,
		OccurredAt: now,
	}
	entryRepo.entries[uuid.New()] = &model.Entry{
		ID:         uuid.New(),
		ClientID:   uuid.New(),
		WalletID:   wallet.ID,
		Type:       model.EntryTypeTopup,
		Amount:     25000,
		ItemName:   "Top-up",
		CreatedBy:  normalUser.ID,
		OccurredAt: now,
	}

	r := gin.New()
	admin := r.Group("/api/admin")
	admin.Use(middleware.AuthMiddleware(jwtMgr, authSvc))
	admin.Use(middleware.RequireRole(model.RoleAdmin))
	{
		admin.GET("/entries", adminHandler.ListEntries)
		admin.GET("/transactions", adminHandler.ListEntries)
		admin.GET("/trends", adminHandler.GetTrends)
		admin.GET("/creators", adminHandler.ListCreators)
		admin.GET("/summary", adminHandler.GetPeriodSummary)
		admin.GET("/stats", adminHandler.GetStats)
	}

	adminToken, _ := jwtMgr.GenerateToken(adminUser)
	userToken, _ := jwtMgr.GenerateToken(normalUser)

	// 1. Non-admin forbidden check
	req, _ := http.NewRequest("GET", "/api/admin/entries", nil)
	req.Header.Set("Authorization", "Bearer "+userToken)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for non-admin, got %d", w.Code)
	}

	// 2. Admin list all entries & period summary
	req, _ = http.NewRequest("GET", "/api/admin/entries", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for admin entries listing, got %d", w.Code)
	}
	var res map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if res["total"] == nil || res["summary"] == nil {
		t.Errorf("expected total and summary in admin entries response")
	}

	// 3. Admin trends
	req, _ = http.NewRequest("GET", "/api/admin/trends", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 OK for admin trends, got %d", w.Code)
	}

	// 4. Admin creators
	req, _ = http.NewRequest("GET", "/api/admin/creators", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 OK for admin creators, got %d", w.Code)
	}

	// 5. Admin stats breakdown
	req, _ = http.NewRequest("GET", "/api/admin/stats", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 OK for admin stats, got %d", w.Code)
	}
}

// =============================================================================
// Asia/Jakarta Period Boundary Tests
// =============================================================================

func TestAsiaJakarta_PeriodBoundaries(t *testing.T) {
	// Date: 2026-09-30 01:30:00 WIB (+07:00)
	// UTC equivalent: 2026-09-29 18:30:00 UTC
	wibLoc := service.JakartaLocation
	refTime := time.Date(2026, 9, 30, 1, 30, 0, 0, wibLoc)

	// 1. "today" in Asia/Jakarta
	start, end, err := service.ParseJakartaDateRange("today", "", "", refTime)
	if err != nil {
		t.Fatalf("ParseJakartaDateRange today failed: %v", err)
	}
	if start.Year() != 2026 || start.Month() != 9 || start.Day() != 30 || start.Hour() != 0 {
		t.Errorf("expected start of today to be 2026-09-30 00:00 WIB, got %v", start)
	}
	if end.Year() != 2026 || end.Month() != 9 || end.Day() != 30 || end.Hour() != 23 {
		t.Errorf("expected end of today to be 2026-09-30 23:59 WIB, got %v", end)
	}

	// An entry recorded at 01:30 WIB (2026-09-29 18:30 UTC) falls inside start and end
	entryTime := refTime.UTC()
	if entryTime.Before(*start) || entryTime.After(*end) {
		t.Errorf("expected entry at 01:30 WIB to fall inside today's boundary")
	}

	// An entry recorded at 23:30 WIB of previous day (2026-09-29 16:30 UTC) falls outside
	prevDayEntry := time.Date(2026, 9, 29, 23, 30, 0, 0, wibLoc).UTC()
	if !prevDayEntry.Before(*start) {
		t.Errorf("expected previous day 23:30 WIB entry to be strictly before today's start")
	}

	// 2. Explicit YYYY-MM-DD in Asia/Jakarta
	startD, endD, err := service.ParseJakartaDateRange("", "2026-09-30", "2026-09-30", time.Time{})
	if err != nil {
		t.Fatalf("ParseJakartaDateRange YYYY-MM-DD failed: %v", err)
	}
	if startD.Location().String() != "Asia/Jakarta" || endD.Location().String() != "Asia/Jakarta" {
		t.Errorf("expected parsed dates to be in Asia/Jakarta timezone")
	}
	if !entryTime.After(*startD) || !entryTime.Before(*endD) {
		t.Errorf("expected 01:30 WIB entry to fall within 2026-09-30 date range")
	}
}

func TestAsiaJakarta_Statement_PeriodRecap(t *testing.T) {
	entryRepo := &mockEntryRepo{entries: make(map[uuid.UUID]*model.Entry)}
	walletRepo := &mockWalletRepo{wallets: make(map[uuid.UUID]*model.Wallet)}

	creatorID := uuid.New()
	wallet := &model.Wallet{ID: uuid.New(), Name: "Buku Recap WIB", CreatorID: creatorID}
	walletRepo.wallets[wallet.ID] = wallet

	wibLoc := service.JakartaLocation

	// Entry 1: Yesterday (2026-09-29 20:00 WIB) = 50,000
	entryRepo.entries[uuid.New()] = &model.Entry{
		ID:         uuid.New(),
		WalletID:   wallet.ID,
		Type:       model.EntryTypeTitipan,
		Amount:     -50000,
		ItemName:   "Makan Siang Kemarin",
		OccurredAt: time.Date(2026, 9, 29, 20, 0, 0, 0, wibLoc).UTC(),
		CreatedBy:  creatorID,
	}

	// Entry 2: Today early morning (2026-09-30 02:00 WIB) = 25,000
	entryRepo.entries[uuid.New()] = &model.Entry{
		ID:         uuid.New(),
		WalletID:   wallet.ID,
		Type:       model.EntryTypeTitipan,
		Amount:     -25000,
		ItemName:   "Kopi Pagi",
		OccurredAt: time.Date(2026, 9, 30, 2, 0, 0, 0, wibLoc).UTC(),
		CreatedBy:  creatorID,
	}

	stmtSvc := service.NewStatementService(entryRepo, walletRepo)

	// Recap for Today (2026-09-30)
	startToday, endToday, _ := service.ParseJakartaDateRange("today", "", "", time.Date(2026, 9, 30, 10, 0, 0, 0, wibLoc))
	resp, err := stmtSvc.GetStatement(context.Background(), wallet.ID, creatorID, model.RoleUser, repository.EntryFilter{
		StartDate: startToday,
		EndDate:   endToday,
	})
	if err != nil {
		t.Fatalf("GetStatement failed: %v", err)
	}

	// Starting balance should be -50,000 (from yesterday's entry)
	if resp.Summary.StartingBalance != -50000 {
		t.Errorf("expected StartingBalance -50000, got %d", resp.Summary.StartingBalance)
	}
	// Period total should be -25,000 (today's entry)
	if resp.Summary.PeriodTotal != -25000 {
		t.Errorf("expected PeriodTotal -25000, got %d", resp.Summary.PeriodTotal)
	}
	// Ending balance should be -75,000
	if resp.Summary.EndingBalance != -75000 {
		t.Errorf("expected EndingBalance -75000, got %d", resp.Summary.EndingBalance)
	}
	// Filtered entries should only contain 1 entry (Kopi Pagi)
	if len(resp.Entries) != 1 || resp.Entries[0].ItemName != "Kopi Pagi" {
		t.Errorf("expected exactly 1 entry for today ('Kopi Pagi'), got %d entries", len(resp.Entries))
	}
}
