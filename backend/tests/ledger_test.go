package tests

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nyuuk/nebengbeli/internal/model"
)

func TestLedgerBalanceCalculation(t *testing.T) {
	walletID := uuid.New()
	userA := uuid.New()
	userB := uuid.New()
	entry1ID := uuid.New()

	entries := []model.Entry{
		{
			ID:         entry1ID,
			ClientID:   uuid.New(),
			WalletID:   walletID,
			Type:       model.EntryTypeTitipan,
			Amount:     50000, // Friend owes 50k for lunch
			ItemName:   "Makan Siang",
			Note:       "Nasi Padang",
			OccurredAt: time.Now().Add(-3 * time.Hour),
			CreatedBy:  userA,
			CreatedAt:  time.Now().Add(-3 * time.Hour),
		},
		{
			ID:         uuid.New(),
			ClientID:   uuid.New(),
			WalletID:   walletID,
			Type:       model.EntryTypeTitipan,
			Amount:     25000, // Friend owes 25k for coffee
			ItemName:   "Kopi Kenangan",
			Note:       "Americano",
			OccurredAt: time.Now().Add(-2 * time.Hour),
			CreatedBy:  userA,
			CreatedAt:  time.Now().Add(-2 * time.Hour),
		},
		{
			ID:         uuid.New(),
			ClientID:   uuid.New(),
			WalletID:   walletID,
			Type:       model.EntryTypeTopup,
			Amount:     -50000, // Friend paid 50k
			ItemName:   "Pelunasan Transfer",
			Note:       "Transfer BCA",
			OccurredAt: time.Now().Add(-1 * time.Hour),
			CreatedBy:  userB,
			CreatedAt:  time.Now().Add(-1 * time.Hour),
		},
		{
			ID:               uuid.New(),
			ClientID:         uuid.New(),
			WalletID:         walletID,
			Type:             model.EntryTypeKoreksi,
			Amount:           -5000, // Correcting coffee by -5k (it was 20k, not 25k)
			ItemName:         "Kopi Kenangan",
			Note:             "Diskon voucher",
			CorrectsEntryID:  &entry1ID,
			CorrectionReason: "Salah input harga awal",
			OccurredAt:       time.Now(),
			CreatedBy:        userA,
			CreatedAt:        time.Now(),
		},
	}

	var totalTitipan, totalTopup, totalKoreksi, currentBalance int64
	var runningBalance int64
	var computedRunningBalances []int64

	for _, e := range entries {
		runningBalance += e.Amount
		computedRunningBalances = append(computedRunningBalances, runningBalance)

		switch e.Type {
		case model.EntryTypeTitipan:
			totalTitipan += e.Amount
		case model.EntryTypeTopup:
			totalTopup += e.Amount
		case model.EntryTypeKoreksi:
			totalKoreksi += e.Amount
		}
		currentBalance += e.Amount
	}

	if totalTitipan != 75000 {
		t.Errorf("expected totalTitipan 75000, got %d", totalTitipan)
	}
	if totalTopup != -50000 {
		t.Errorf("expected totalTopup -50000, got %d", totalTopup)
	}
	if totalKoreksi != -5000 {
		t.Errorf("expected totalKoreksi -5000, got %d", totalKoreksi)
	}
	if currentBalance != 20000 {
		t.Errorf("expected currentBalance 20000, got %d", currentBalance)
	}

	expectedRunning := []int64{50000, 75000, 25000, 20000}
	for i, expected := range expectedRunning {
		if computedRunningBalances[i] != expected {
			t.Errorf("step %d running balance expected %d, got %d", i, expected, computedRunningBalances[i])
		}
	}
}
