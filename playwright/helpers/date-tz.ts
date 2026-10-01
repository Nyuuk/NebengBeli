/**
 * Date and Timezone Helpers for Asia/Jakarta (WIB, UTC+7).
 */

export function getAsiaJakartaNow(): Date {
  // Current time formatted in Asia/Jakarta timezone
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

export function formatRupiah(amount: number): string {
  const formatted = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${formatted}`;
}

export function parseRupiah(text: string): number {
  const clean = text.replace(/[^0-9-]/g, '');
  return parseInt(clean, 10) || 0;
}

export function getPresetDateRanges() {
  const now = new Date();
  
  // Today: 00:00:00 to 23:59:59
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // This week: Monday to Sunday
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0);

  // This month: 1st of month to end
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  return {
    todayStart,
    todayEnd,
    weekStart,
    monthStart,
  };
}
