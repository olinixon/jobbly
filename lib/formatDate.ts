/**
 * Format a date as "27 March 2025, 20:40" in the user's local timezone.
 * Used for all date displays throughout Jobbly.
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const day = d.getDate()
  const month = d.toLocaleString('en-NZ', { month: 'long' })
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${year}, ${hours}:${minutes}`
}

/**
 * Format a date as "27 March 2025" (no time).
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const day = d.getDate()
  const month = d.toLocaleString('en-NZ', { month: 'long' })
  const year = d.getFullYear()
  return `${day} ${month} ${year}`
}
