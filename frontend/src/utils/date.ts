/**
 * Utility functions for browser-local date and time conversions.
 */

/**
 * Formats a Date (default: now) into 'YYYY-MM-DDTHH:mm' in the browser's local timezone
 * suitable for HTML datetime-local input elements.
 */
export function getLocalDatetimeInputValue(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Formats a Date (default: now) into 'YYYY-MM-DD' in the browser's local timezone
 * suitable for HTML date input elements.
 */
export function getLocalDateInputValue(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

/**
 * Converts a browser-local datetime input value ('YYYY-MM-DDTHH:mm') into an ISO-8601 UTC string.
 * Accurately preserves the user's selected local calendar date and time.
 */
export function localDatetimeInputToISO(localDatetimeStr?: string): string {
  if (!localDatetimeStr || !localDatetimeStr.trim()) {
    return new Date().toISOString();
  }

  const trimmed = localDatetimeStr.trim();

  // If already an ISO string with explicit UTC or offset (e.g. 2026-09-29T12:00:00Z or +07:00)
  if (trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  // Parse YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss as local browser time
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (match) {
    const [, y, m, d, h, min, s] = match;
    const localDate = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      s ? Number(s) : 0,
      0
    );
    if (!isNaN(localDate.getTime())) {
      return localDate.toISOString();
    }
  }

  const fallback = new Date(trimmed);
  return !isNaN(fallback.getTime()) ? fallback.toISOString() : new Date().toISOString();
}

/**
 * Converts any date representation (Date, ISO string, or datetime-local string)
 * into a browser-local 'YYYY-MM-DDTHH:mm' string for datetime-local input value.
 */
export function formatToLocalDatetimeInput(value?: string | Date | null): string {
  if (!value) {
    return getLocalDatetimeInputValue();
  }

  if (value instanceof Date) {
    return getLocalDatetimeInputValue(value);
  }

  const trimmed = value.trim();
  // If already in YYYY-MM-DDTHH:mm format without offset/Z
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    return getLocalDatetimeInputValue();
  }

  return getLocalDatetimeInputValue(date);
}
