import { describe, it, expect } from 'vitest';
import { generateRekapText } from '../components/RekapTextModal';
import { Wallet, Entry } from '../types';

describe('Rekap Teks (Export to Text) Generation', () => {
  const mockWallet: Wallet = {
    id: 'wallet-123',
    name: 'Rendy - Kopi',
    creator_id: 'user-ob',
    creator_username: 'rahmat_ob',
    owner_id: 'user-penitip',
    owner_username: 'rendy',
    balance: 20000,
    entry_count: 3,
    is_archived: false,
    created_at: new Date('2026-09-01T08:00:00Z').toISOString(),
  };

  it('should generate accurate text recap with starting balance, entries, and ending balance', () => {
    const today = new Date();
    const todayMorning = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0).toISOString();
    const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 30, 0).toISOString();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 10, 0, 0).toISOString();

    const entries: Entry[] = [
      // Entry from yesterday (will form starting balance for today's recap)
      {
        id: 'e-1',
        client_id: 'c-1',
        wallet_id: 'wallet-123',
        type: 'titipan',
        amount: -25000,
        item_name: 'Kopi Kenangan',
        note: '',
        occurred_at: yesterday,
        created_by: 'user-ob',
        created_at: yesterday,
      },
      // Entries from today
      {
        id: 'e-2',
        client_id: 'c-2',
        wallet_id: 'wallet-123',
        type: 'titipan',
        amount: -30000,
        item_name: 'Makan Siang Nasi Padang',
        note: 'Rendang + perkedel',
        occurred_at: todayMorning,
        created_by: 'user-ob',
        created_at: todayMorning,
      },
      {
        id: 'e-3',
        client_id: 'c-3',
        wallet_id: 'wallet-123',
        type: 'topup',
        amount: 35000,
        item_name: 'Transfer QRIS',
        note: 'BCA',
        occurred_at: todayNoon,
        created_by: 'user-ob',
        created_at: todayNoon,
      },
    ];

    const result = generateRekapText(mockWallet, entries, 'today');

    expect(result.startingBalance).toBe(-25000);
    expect(result.filteredEntries.length).toBe(2);
    expect(result.totalDelta).toBe(5000); // -30000 + 35000
    expect(result.endingBalance).toBe(-20000); // -25000 + 5000

    expect(result.rekapText).toContain('REKAP BUKU TITIPAN — RENDY - KOPI');
    expect(result.rekapText).toContain('rahmat_ob');
    expect(result.rekapText).toContain('Saldo Awal: -Rp\u00a025.000');
    expect(result.rekapText).toContain('Makan Siang Nasi Padang (Rendang + perkedel)');
    expect(result.rekapText).toContain('Transfer QRIS (BCA)');
    expect(result.rekapText).toContain('Saldo Akhir: -Rp\u00a020.000');
  });

  it('should flag offline pending entries in recap', () => {
    const today = new Date().toISOString();
    const entries: Entry[] = [
      {
        id: 'e-offline',
        client_id: 'c-offline',
        wallet_id: 'wallet-123',
        type: 'titipan',
        amount: 15000,
        item_name: 'Es Teh Manis',
        note: '',
        occurred_at: today,
        created_by: 'user-ob',
        created_at: today,
        is_offline_pending: true,
      },
    ];

    const result = generateRekapText(mockWallet, entries, 'today');
    expect(result.hasOfflineEntries).toBe(true);
    expect(result.rekapText).toContain('[Pending Offline]');
  });
});
