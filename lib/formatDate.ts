/**
 * Formats a date/timestamp for display in New Zealand time (Pacific/Auckland).
 * All timestamps are stored as UTC in the database — this converts them for display only.
 */
export function formatNZDate(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '—'

  const d = typeof date === 'string' ? new Date(date) : date

  if (isNaN(d.getTime())) return '—'

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }

  return d.toLocaleString('en-NZ', options ?? defaultOptions)
}

/**
 * Date only — no time component. Used for job booked dates, completed dates, etc.
 */
export function formatNZDateOnly(date: Date | string | null | undefined): string {
  return formatNZDate(date, {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Aliases used by existing imports throughout the codebase
export const formatDateTime = formatNZDate
export const formatDate = formatNZDateOnly
