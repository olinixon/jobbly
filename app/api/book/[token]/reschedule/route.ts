import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const lead = await prisma.lead.findUnique({
    where: { bookingToken: token },
    include: {
      booking: { include: { slot: true } },
    },
  })

  if (!lead) return NextResponse.json({ error: 'Invalid booking link' }, { status: 404 })

  const booking = lead.booking
  if (!booking || booking.status !== 'CONFIRMED') {
    return NextResponse.json({ error: 'No confirmed booking found to reschedule' }, { status: 400 })
  }

  // Capture old booking details before releasing
  const oldBooking = {
    date: booking.slot.date.toLocaleDateString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }),
    window_start: booking.windowStart,
    window_end: booking.windowEnd,
    slot_date_nz: booking.slot.date.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }),
  }

  // Release the confirmed booking and reset lead to QUOTE_SENT so the hold endpoint allows a new hold
  await prisma.$transaction([
    prisma.booking.delete({ where: { id: booking.id } }),
    prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'QUOTE_SENT' },
    }),
  ])

  return NextResponse.json({ success: true, old_booking: oldBooking })
}
