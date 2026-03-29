import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { nzLocalToUtc, formatICSDate } from '@/lib/generateCalendarLinks'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const lead = await prisma.lead.findUnique({
    where: { bookingToken: token },
    include: {
      jobType: true,
      booking: { include: { slot: true } },
    },
  })

  if (!lead || !lead.booking || lead.booking.status !== 'CONFIRMED') {
    return new NextResponse('Not found', { status: 404 })
  }

  const booking = lead.booking
  const slotDateNZ = booking.slot.date.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
  const startUtc = nzLocalToUtc(slotDateNZ, booking.windowStart)
  const endUtc = nzLocalToUtc(slotDateNZ, booking.windowEnd)

  const now = new Date()
  const jobTypeName = lead.jobType?.name ?? 'Gutter Clean'
  const title = `Gutter Clean — ${lead.propertyAddress}`
  const description = `Quote number: ${lead.quoteNumber}\\nJob type: ${jobTypeName}`

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jobbly//EN',
    'BEGIN:VEVENT',
    `UID:${booking.id}@jobbly`,
    `DTSTAMP:${formatICSDate(now)}`,
    `DTSTART:${formatICSDate(startUtc)}`,
    `DTEND:${formatICSDate(endUtc)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${lead.propertyAddress}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="booking.ics"',
    },
  })
}
