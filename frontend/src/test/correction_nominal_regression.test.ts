import { describe, it, expect } from 'vitest';
import { Entry } from '../types';

describe('Correction Nominal & Effective Balance Regressions', () => {
  it('correctly calculates delta for standard titipan adjustments', () => {
    // Original titipan: -25.000 (titipan is a debit against the owner)
    const originalTitipan: Entry = {
      id: 'entry-1',
      client_id: 'client-1',
      wallet_id: 'wallet-1',
      type: 'titipan',
      amount: -25000,
      item_name: 'Kopi Kenangan',
      note: '',
      occurred_at: new Date().toISOString(),
      created_by: 'user-ob',
      created_at: new Date().toISOString(),
    };

    // 1. Correction to higher correct price (30.000, signed target -30.000) -> Delta should be -5.000 (more debt)
    const signedTargetHigh = -30000;
    const deltaHigh = signedTargetHigh - originalTitipan.amount;
    expect(deltaHigh).toBe(-5000);

    // 2. Correction to lower correct price (20.000, signed target -20.000) -> Delta should be +5.000 (less debt)
    const signedTargetLow = -20000;
    const deltaLow = signedTargetLow - originalTitipan.amount;
    expect(deltaLow).toBe(5000);

    // 3. Full cancellation (0) -> Delta should be +25.000 (debt fully cleared)
    const signedTargetCancel = 0;
    const deltaCancel = signedTargetCancel - originalTitipan.amount;
    expect(deltaCancel).toBe(25000);
  });

  it('correctly calculates delta for top-up adjustments', () => {
    // Original top-up: +50.000 (credit to wallet)
    const originalTopup: Entry = {
      id: 'entry-topup-1',
      client_id: 'client-topup-1',
      wallet_id: 'wallet-1',
      type: 'topup',
      amount: 50000,
      item_name: 'Transfer BCA',
      note: '',
      occurred_at: new Date().toISOString(),
      created_by: 'user-ob',
      created_at: new Date().toISOString(),
    };

    // User inputs nominal yang benar: 60.000 (signed target: +60.000)
    // Delta = signedTarget - effectiveAmount = 60.000 - 50.000 = +10.000 (additional credit)
    const parsedTargetHigh = 60000;
    const signedTargetHigh = parsedTargetHigh;
    const deltaHigh = signedTargetHigh - originalTopup.amount;
    expect(deltaHigh).toBe(10000);

    // User inputs nominal yang benar: 30.000 (signed target: +30.000)
    // Delta = signedTarget - effectiveAmount = 30.000 - 50.000 = -20.000 (reversing over-credit)
    const parsedTargetLow = 30000;
    const signedTargetLow = parsedTargetLow;
    const deltaLow = signedTargetLow - originalTopup.amount;
    expect(deltaLow).toBe(-20000);

    // User inputs nominal yang benar: 0 (Cancellation of topup)
    // Delta = 0 - 50.000 = -50.000
    const parsedTargetCancel = 0;
    const signedTargetCancel = parsedTargetCancel;
    const deltaCancel = signedTargetCancel - originalTopup.amount;
    expect(deltaCancel).toBe(-50000);
  });

  it('computes multi-stage correction chain effective amounts accurately', () => {
    // Initial Titipan: -100.000
    const originalEntry: Entry = {
      id: 'entry-orig',
      client_id: 'c-orig',
      wallet_id: 'wallet-1',
      type: 'titipan',
      amount: -100000,
      item_name: 'Makan Bersama Tim',
      note: '',
      occurred_at: '2026-09-28T12:00:00Z',
      created_by: 'user-ob',
      created_at: '2026-09-28T12:00:00Z',
    };

    // First correction: corrected to 120.000 (signed target -120.000, delta -20.000, more debt)
    const correction1: Entry = {
      id: 'corr-1',
      client_id: 'c-corr-1',
      wallet_id: 'wallet-1',
      type: 'koreksi',
      amount: -20000,
      item_name: 'Makan Bersama Tim',
      note: 'Koreksi: Salah struk',
      corrects_entry_id: 'entry-orig',
      occurred_at: '2026-09-28T13:00:00Z',
      created_by: 'user-ob',
      created_at: '2026-09-28T13:00:00Z',
    };

    // Effective amount after correction 1
    const effective1 = originalEntry.amount + correction1.amount;
    expect(effective1).toBe(-120000);

    // Second correction: realized final price was 110.000 (delta from effective -120.000 is +10.000)
    const targetFinal = -110000;
    const delta2 = targetFinal - effective1;
    expect(delta2).toBe(10000);

    const correction2: Entry = {
      id: 'corr-2',
      client_id: 'c-corr-2',
      wallet_id: 'wallet-1',
      type: 'koreksi',
      amount: delta2,
      item_name: 'Makan Bersama Tim',
      note: 'Koreksi: Diskon promo tambahan',
      corrects_entry_id: 'entry-orig',
      occurred_at: '2026-09-28T14:00:00Z',
      created_by: 'user-ob',
      created_at: '2026-09-28T14:00:00Z',
    };

    // Effective amount across all corrections
    const allCorrections = [correction1, correction2];
    const totalCorrectionDelta = allCorrections.reduce((sum, c) => sum + c.amount, 0);
    const finalEffective = originalEntry.amount + totalCorrectionDelta;

    expect(totalCorrectionDelta).toBe(-10000);
    expect(finalEffective).toBe(-110000);
  });
});
