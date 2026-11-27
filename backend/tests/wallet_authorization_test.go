package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/handler"
	"github.com/nyuuk/nebengbeli/internal/middleware"
	"github.com/nyuuk/nebengbeli/internal/model"
	"github.com/nyuuk/nebengbeli/internal/service"
)

// Exercise handlers with real services: role propagation, HTTP errors, persistence,
// and audit attribution must agree for every wallet mutation.
func TestWalletMutationAuthorization(t *testing.T) {
	for _, actorKind := range []string{"admin", "linked-owner", "creator", "stranger"} {
		for _, operation := range []string{"rename", "archive", "unarchive", "unlink", "link", "titipan", "topup", "correction", "move", "move-owner-target", "batch"} {
			t.Run(actorKind+"/"+operation, func(t *testing.T) {
				creatorID, ownerID := uuid.New(), uuid.New()
				actor := &model.User{ID: uuid.New(), Role: model.RoleUser}
				switch actorKind {
				case "admin":
					actor.Role = model.RoleAdmin
				case "linked-owner":
					actor.ID = ownerID
				case "creator":
					actor.ID = creatorID
				}
				source := &model.Wallet{ID: uuid.New(), Name: "Source", CreatorID: creatorID, OwnerID: &ownerID}
				target := &model.Wallet{ID: uuid.New(), Name: "Target", CreatorID: uuid.New(), OwnerID: &ownerID}
				if actorKind == "creator" {
					target.CreatorID = creatorID
				}
				// Reach the target authorization check with a source the linked owner created.
				if operation == "move-owner-target" && actorKind == "linked-owner" {
					source.CreatorID = actor.ID
				}
				if operation == "unarchive" {
					now := time.Now()
					source.ArchivedAt = &now
					source.IsArchived = true
				}
				wallets := &mockWalletRepo{wallets: map[uuid.UUID]*model.Wallet{source.ID: source, target.ID: target}}
				original := &model.Entry{ID: uuid.New(), ClientID: uuid.New(), WalletID: source.ID, Type: model.EntryTypeTitipan, Amount: -100, ItemName: "Coffee", CreatedBy: creatorID}
				originalBefore := *original
				entries := &mockEntryRepo{entries: map[uuid.UUID]*model.Entry{original.ID: original}}
				audit := &mockAuditRepo{}
				recipient := &model.User{ID: uuid.New(), Username: "recipient", Role: model.RoleUser}
				users := &mockUserRepo{users: map[string]*model.User{recipient.Username: recipient}}
				links := &mockLinkRepo{}
				wh := handler.NewWalletHandler(service.NewWalletService(wallets, users, entries, audit))
				eh := handler.NewEntryHandler(service.NewEntryService(entries, wallets, audit))
				lh := handler.NewLinkRequestHandler(service.NewLinkService(links, wallets, users, audit))
				r := gin.New()
				r.Use(func(c *gin.Context) { c.Set(middleware.ContextKeyUser, actor); c.Next() })
				path := "/wallets/" + source.ID.String()
				route := "/wallets/:id"
				body := any(map[string]any{})
				var handle gin.HandlerFunc
				wantStatus := http.StatusOK
				var action model.AuditAction
				switch operation {
				case "rename":
					handle = wh.UpdateName
					body = gin.H{"name": "Renamed"}
					action = model.AuditActionWalletUpdate
				case "archive":
					handle = wh.Archive
					action = model.AuditActionWalletArchive
				case "unarchive":
					handle = wh.Unarchive
					action = model.AuditActionWalletUnarchive
				case "unlink":
					handle = wh.Unlink
					action = model.AuditActionWalletUnlink
				case "link":
					handle = lh.Create
					body = gin.H{"target_username": recipient.Username}
					wantStatus = http.StatusCreated
					action = model.AuditActionLinkRequestCreate
				case "titipan", "topup", "correction":
					handle = eh.Create
					wantStatus = http.StatusCreated
					action = model.AuditActionEntryCreate
					body = gin.H{"type": operation, "amount": 50, "item_name": "Coffee"}
					if operation == "correction" {
						body = gin.H{"type": "koreksi", "amount": 50, "corrects_entry_id": original.ID, "correction_reason": "salah harga"}
						action = model.AuditActionEntryCorrect
					}
				case "move", "move-owner-target":
					handle = eh.Move
					body = service.MoveEntryRequest{SourceWalletID: source.ID, TargetWalletID: target.ID, EntryID: original.ID}
					action = model.AuditActionEntryMove
				case "batch":
					handle = eh.CreateBatch
					wantStatus = http.StatusCreated
					action = model.AuditActionEntryBatchCreate
					body = model.BatchEntriesRequest{Entries: []model.BatchEntryItem{{WalletID: source.ID, ItemName: "Coffee", Amount: 50}, {WalletID: target.ID, ItemName: "Tea", Amount: 25}}}
				}
				sourceBefore, targetBefore := *source, *target
				r.POST(route, handle)
				payload, err := json.Marshal(body)
				if err != nil {
					t.Fatal(err)
				}
				req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(payload))
				req.Header.Set("Content-Type", "application/json")
				resp := httptest.NewRecorder()
				r.ServeHTTP(resp, req)
				allowed := actorKind == "admin" || actorKind == "creator"
				if !allowed {
					wantStatus = http.StatusForbidden
				}
				if resp.Code != wantStatus {
					t.Fatalf("status = %d, want %d: %s", resp.Code, wantStatus, resp.Body.String())
				}
				if !allowed {
					if !reflect.DeepEqual(*source, sourceBefore) || !reflect.DeepEqual(*target, targetBefore) || len(entries.entries) != 1 || len(links.reqs) != 0 || len(audit.logs) != 0 {
						t.Fatal("denied operation changed state or emitted audit")
					}
					return
				}
				if len(audit.logs) != 1 || audit.logs[0].ActorID == nil || *audit.logs[0].ActorID != actor.ID || audit.logs[0].Action != string(action) {
					t.Fatalf("incorrect audit: %+v", audit.logs)
				}
				if !reflect.DeepEqual(*original, originalBefore) {
					t.Fatal("original entry mutated instead of appending")
				}
				switch operation {
				case "rename":
					if source.Name != "Renamed" {
						t.Fatal("rename not persisted")
					}
				case "archive":
					if source.ArchivedAt == nil {
						t.Fatal("archive not persisted")
					}
				case "unarchive":
					if source.ArchivedAt != nil {
						t.Fatal("unarchive not persisted")
					}
				case "unlink":
					if source.OwnerID != nil {
						t.Fatal("unlink not persisted")
					}
				case "link":
					for _, link := range links.reqs {
						if link.RequestedBy != actor.ID || link.TargetUserID != recipient.ID {
							t.Fatal("incorrect link attribution")
						}
					}
					if len(links.reqs) != 1 {
						t.Fatal("link not persisted")
					}
				default:
					wantCount := 2
					if operation == "move" || operation == "move-owner-target" || operation == "batch" {
						wantCount = 3
					}
					if len(entries.entries) != wantCount {
						t.Fatalf("entry count = %d, want %d", len(entries.entries), wantCount)
					}
					for id, e := range entries.entries {
						if id != original.ID && e.CreatedBy != actor.ID {
							t.Fatal("incorrect entry actor")
						}
					}
					if operation == "correction" {
						effective, err := entries.GetByID(context.Background(), original.ID)
						if err != nil || effective.EffectiveAmount != -50 {
							t.Fatalf("incorrect correction: %+v, %v", effective, err)
						}
					}
				}
			})
		}
	}
}

func TestNonCorrectionEntryRejectsCrossWalletCorrectionReference(t *testing.T) {
	for _, kind := range []model.EntryType{model.EntryTypeTitipan, model.EntryTypeTopup} {
		t.Run(string(kind), func(t *testing.T) {
			actorID := uuid.New()
			walletA := &model.Wallet{ID: uuid.New(), CreatorID: uuid.New(), OwnerID: &actorID}
			walletB := &model.Wallet{ID: uuid.New(), CreatorID: actorID}
			wallets := &mockWalletRepo{wallets: map[uuid.UUID]*model.Wallet{walletA.ID: walletA, walletB.ID: walletB}}
			original := &model.Entry{ID: uuid.New(), WalletID: walletA.ID, Type: model.EntryTypeTitipan, Amount: -100, ItemName: "Coffee"}
			originalBefore := *original
			entries := &mockEntryRepo{entries: map[uuid.UUID]*model.Entry{original.ID: original}}
			audit := &mockAuditRepo{}
			svc := service.NewEntryService(entries, wallets, audit)

			entry, duplicate, err := svc.CreateEntry(context.Background(), actorID, model.RoleUser, service.CreateEntryRequest{
				WalletID: walletB.ID, Type: kind, Amount: 50, ItemName: "Tea", CorrectsEntryID: &original.ID,
			})
			if err == nil || err.Error() != "corrects_entry_id is only allowed for koreksi entries" || entry != nil || duplicate {
				t.Fatalf("expected validation rejection, got entry=%+v, duplicate=%v, err=%v", entry, duplicate, err)
			}
			if len(entries.entries) != 1 || !reflect.DeepEqual(*original, originalBefore) || len(audit.logs) != 0 {
				t.Fatal("rejected entry changed ledger or audit")
			}
		})
	}
}

func TestApproveLinkRequestRejectsArchivedWallet(t *testing.T) {
	now := time.Now()
	targetID := uuid.New()
	wallet := &model.Wallet{ID: uuid.New(), CreatorID: uuid.New(), ArchivedAt: &now}
	walletBefore := *wallet
	request := &model.LinkRequest{ID: uuid.New(), WalletID: wallet.ID, RequestedBy: wallet.CreatorID, TargetUserID: targetID, Status: model.LinkRequestStatusPending}
	requestBefore := *request
	wallets := &mockWalletRepo{wallets: map[uuid.UUID]*model.Wallet{wallet.ID: wallet}}
	links := &mockLinkRepo{reqs: map[uuid.UUID]*model.LinkRequest{request.ID: request}}
	audit := &mockAuditRepo{}
	svc := service.NewLinkService(links, wallets, nil, audit)

	approved, err := svc.ApproveLinkRequest(context.Background(), targetID, request.ID)
	if !errors.Is(err, service.ErrArchivedWallet) || approved != nil {
		t.Fatalf("expected archived wallet rejection, got request=%+v, err=%v", approved, err)
	}
	if !reflect.DeepEqual(*wallet, walletBefore) || !reflect.DeepEqual(*request, requestBefore) || len(audit.logs) != 0 {
		t.Fatal("rejected approval changed wallet, request, or audit")
	}
}

func TestAdminMutationsKeepArchivedWalletGuards(t *testing.T) {
	ctx := context.Background()
	adminID := uuid.New()
	now := time.Now()
	source := &model.Wallet{ID: uuid.New(), CreatorID: uuid.New(), ArchivedAt: &now}
	target := &model.Wallet{ID: uuid.New(), CreatorID: uuid.New(), ArchivedAt: &now}
	wallets := &mockWalletRepo{wallets: map[uuid.UUID]*model.Wallet{source.ID: source, target.ID: target}}
	entries := &mockEntryRepo{entries: map[uuid.UUID]*model.Entry{}}
	audit := &mockAuditRepo{}
	svc := service.NewEntryService(entries, wallets, audit)
	for _, kind := range []model.EntryType{model.EntryTypeTitipan, model.EntryTypeTopup, model.EntryTypeKoreksi} {
		if _, _, err := svc.CreateEntry(ctx, adminID, model.RoleAdmin, service.CreateEntryRequest{WalletID: source.ID, Type: kind, Amount: 100, ItemName: "Coffee"}); err != service.ErrArchivedWallet {
			t.Fatalf("%s: %v", kind, err)
		}
	}
	if _, err := svc.CreateBatchEntries(ctx, adminID, model.RoleAdmin, model.BatchEntriesRequest{Entries: []model.BatchEntryItem{{WalletID: source.ID, ItemName: "Coffee", Amount: 100}}}); !errors.Is(err, service.ErrArchivedWallet) {
		t.Fatalf("batch: %v", err)
	}
	for _, tc := range []struct {
		name           string
		sourceArchived bool
		wantErr        error
	}{
		{name: "archived-source-active-destination", sourceArchived: true, wantErr: service.ErrArchivedWallet},
		{name: "active-source-archived-destination", sourceArchived: false, wantErr: service.ErrDestinationArchived},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source.ArchivedAt, target.ArchivedAt = nil, nil
			if tc.sourceArchived {
				source.ArchivedAt = &now
			} else {
				target.ArchivedAt = &now
			}
			if _, _, err := svc.MoveEntry(ctx, adminID, model.RoleAdmin, service.MoveEntryRequest{SourceWalletID: source.ID, TargetWalletID: target.ID, EntryID: uuid.New()}); !errors.Is(err, tc.wantErr) {
				t.Fatalf("move: got %v, want %v", err, tc.wantErr)
			}
		})
	}
	source.ArchivedAt = &now
	links := service.NewLinkService(&mockLinkRepo{}, wallets, nil, audit)
	if _, err := links.CreateLinkRequest(ctx, adminID, model.RoleAdmin, source.ID, "recipient"); err != service.ErrArchivedWallet {
		t.Fatalf("link: %v", err)
	}
	if len(entries.entries) != 0 || len(audit.logs) != 0 {
		t.Fatal("archived operation changed ledger or audit")
	}
}
