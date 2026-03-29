export interface CalendarLinks {
  google: string
  apple_ics: string  // URL to the .ics endpoint
  outlook: string
}

function nzLocalToUtc(nzDateStr: string, nzTimeStr: string): Date {
  // Convert NZ local date+time to UTC using Pacific/Auckland timezone
  // Uses iterative approach to avoid hardcoding the offset
  const [year, month, day] = nzDateStr.split('-').map(Number)
  const [hour, minute] = nzTimeStr.split(':').map(Number)

  // Start estimate: treat NZ time as UTC and adjust
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute))

  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Pacific/Auckland',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(candidate)

    const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value)
    const displayedHour = get('hour') % 24
    const displayedMin = get('minute')
    const displayedDay = get('day')
    const displayedMonth = get('month')
    const displayedYear = get('year')

    const targetMs = Date.UTC(year, month - 1, day, hour, minute)
    const displayedMs = Date.UTC(displayedYear, displayedMonth - 1, displayedDay, displayedHour, displayedMin)

    candidate = new Date(candidate.getTime() + (targetMs - displayedMs))
  }
  return candidate
}

function formatICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function formatGoogleDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function generateCalendarLinks(params: {
  bookingToken: string
  bookingId: string
  windowStartNZ: string   // "07:00" — NZ local time
  windowEndNZ: string     // "09:00"
  slotDateNZ: string      // "2026-04-05" — NZ local date
  propertyAddress: string
  quoteNumber: string
  jobTypeName: string
  appUrl: string
}): CalendarLinks {
  const {
    bookingToken, bookingId, windowStartNZ, windowEndNZ, slotDateNZ,
    propertyAddress, quoteNumber, jobTypeName, appUrl,
  } = params

  const startUtc = nzLocalToUtc(slotDateNZ, windowStartNZ)
  const endUtc = nzLocalToUtc(slotDateNZ, windowEndNZ)

  const title = `Gutter Clean — ${propertyAddress}`
  const description = `Quote number: ${quoteNumber}\nJob type: ${jobTypeName}`

  // Google Calendar
  const googleDates = `${formatGoogleDate(startUtc)}/${formatGoogleDate(endUtc)}`
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${googleDates}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(propertyAddress)}`

  // Apple Calendar (.ics endpoint)
  const apple_ics = `${appUrl}/api/book/${bookingToken}/calendar.ics`

  // Outlook Web
  const outlook = `https://outlook.live.com/calendar/0/action/compose?rru=addevent&startdt=${startUtc.toISOString()}&enddt=${endUtc.toISOString()}&subject=${encodeURIComponent(title)}&body=${encodeURIComponent(description)}&location=${encodeURIComponent(propertyAddress)}`

  // suppress unused warning (bookingId is used for .ics content, not the links)
  void bookingId

  return { google, apple_ics, outlook }
}

export { formatICSDate, nzLocalToUtc }
