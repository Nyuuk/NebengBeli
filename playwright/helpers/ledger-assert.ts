import { expect } from '@playwright/test';

/**
 * Financial ledger assertions according to NebengBeli PRD core concepts:
 * 1. Balance is sum of all entries: Titipan is debit (-/+, in UI debit is +tagihan or +spending, topup is -tagihan).
 * 2. Balance invariant: startingBalance + periodDelta === endingBalance.
 * 3. Effective nominal of an entry = original amount + sum(corrections).
 */

export interface LedgerEntry {
  id: string;
  type: 'titipan' | 'topup' | 'koreksi';
  amount: number;
  effective_amount?: number;
  occurred_at?: string;
  created_at?: string;
}

export function assertLedgerInvariant(
  startingBalance: number,
  periodDelta: number,
  endingBalance: number
): void {
  const calculatedEnding = startingBalance + periodDelta;
  expect(
    endingBalance,
    `Ledger balance invariant violated: startingBalance (${startingBalance}) + periodDelta (${periodDelta}) = ${calculatedEnding}, but endingBalance is ${endingBalance}`
  ).toBe(calculatedEnding);
}

export function calculateEffectiveAmount(
  originalAmount: number,
  correctionAmounts: number[]
): number {
  return originalAmount + correctionAmounts.reduce((sum, c) => sum + c, 0);
}

export function calculateCumulativeBalance(entries: LedgerEntry[]): number {
  return entries.reduce((acc, e) => acc + e.amount, 0);
}
