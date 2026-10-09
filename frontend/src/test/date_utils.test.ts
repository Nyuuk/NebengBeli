import { describe, it, expect } from 'vitest';
import {
  getLocalDatetimeInputValue,
  getLocalDateInputValue,
  localDatetimeInputToISO,
  formatToLocalDatetimeInput,
} from '../utils/date';

describe('Browser-Local Date Utilities', () => {
  it('formats Date to local datetime input string YYYY-MM-DDTHH:mm', () => {
    // Construct local date: 2026-10-09 14:35
    const date = new Date(2026, 9, 9, 14, 35, 0);
    const result = getLocalDatetimeInputValue(date);
    expect(result).toBe('2026-10-09T14:35');
  });

  it('pads single digit months, days, hours, and minutes with leading zeros', () => {
    // Construct local date: 2026-03-05 07:08
    const date = new Date(2026, 2, 5, 7, 8, 0);
    const result = getLocalDatetimeInputValue(date);
    expect(result).toBe('2026-03-05T07:08');
  });

  it('formats Date to local date input string YYYY-MM-DD', () => {
    const date = new Date(2026, 0, 5); // 2026-01-05
    const result = getLocalDateInputValue(date);
    expect(result).toBe('2026-01-05');
  });

  it('converts browser-local datetime input to accurate UTC ISO string', () => {
    const input = '2026-10-09T14:30';
    const iso = localDatetimeInputToISO(input);

    const expectedDate = new Date(2026, 9, 9, 14, 30, 0, 0);
    expect(iso).toBe(expectedDate.toISOString());
  });

  it('handles datetime input with seconds', () => {
    const input = '2026-10-09T14:30:45';
    const iso = localDatetimeInputToISO(input);

    const expectedDate = new Date(2026, 9, 9, 14, 30, 45, 0);
    expect(iso).toBe(expectedDate.toISOString());
  });

  it('preserves existing ISO strings ending with Z or timezone offsets in localDatetimeInputToISO', () => {
    const isoInput = '2026-10-09T07:30:00.000Z';
    expect(localDatetimeInputToISO(isoInput)).toBe(isoInput);

    const offsetInput = '2026-10-09T14:30:00+07:00';
    expect(localDatetimeInputToISO(offsetInput)).toBe(new Date(offsetInput).toISOString());
  });

  it('returns current time ISO when input is empty or invalid', () => {
    const iso = localDatetimeInputToISO('');
    expect(iso).toBeDefined();
    expect(new Date(iso).getTime()).not.toBeNaN();
  });

  it('formats ISO string or Date or existing local string to datetime-local input format in formatToLocalDatetimeInput', () => {
    // Local string preserved
    expect(formatToLocalDatetimeInput('2026-10-09T14:30')).toBe('2026-10-09T14:30');

    // Date object formatted to local
    const date = new Date(2026, 9, 9, 16, 45, 0);
    expect(formatToLocalDatetimeInput(date)).toBe('2026-10-09T16:45');

    // ISO string converted to local
    const iso = date.toISOString();
    expect(formatToLocalDatetimeInput(iso)).toBe('2026-10-09T16:45');

    // Undefined returns current local time
    const nowLocal = getLocalDatetimeInputValue();
    expect(formatToLocalDatetimeInput(undefined)).toBe(nowLocal);
  });
});
