import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function generateWindows(startTime: string, endTime: string, durationMinutes: number) {
  const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  const windows = []

  let current = start
  while (current + durationMinutes <= end) {
    windows.push({ windowStart: toTime(current), windowEnd: toTime(current + durationMinutes) })
    current += durationMinutes
  }
  return windows
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const lead = await prisma.lead.findUnique({
    where: { bookingToken: token },
    include: { jobType: true },
  })

  if (!lead || !lead.bookingToken) {
    return NextResponse.json({ error: 'Invalid booking link' }, { status: 404 })
  }

  if (!lead.jobType) {
    return NextResponse.json({ error: 'No job type assigned to this lead' }, { status: 400 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rawSlots = await prisma.availabilitySlot.findMany({
    where: {
      campaignId: lead.campaignId,
      date: { gte: today },
    },
    orderBy: { date: 'asc' },
    include: {
      bookings: {
        select: {
          id: true,
          windowStart: true,
          windowEnd: true,
          status: true,
          heldUntil: true,
          heldByToken: true,
        },
      },
    },
  })

  const now = new Date()
  const durationMinutes = lead.jobType.durationMinutes

  const slots = rawSlots.map(slot => {
    const windows = generateWindows(slot.startTime, slot.endTime, durationMinutes)

    const windowsWithStatus = windows.map(w => {
      const confirmedBooking = slot.bookings.find(
        b => b.windowStart === w.windowStart && b.windowEnd === w.windowEnd && b.status === 'CONFIRMED'
      )
      if (confirmedBooking) return null // hidden

      const activeHold = slot.bookings.find(
        b =>
          b.windowStart === w.windowStart &&
          b.windowEnd === w.windowEnd &&
          b.status === 'HELD' &&
          b.heldUntil &&
          b.heldUntil > now &&
          b.heldByToken !== token
      )

      const myHold = slot.bookings.find(
        b =>
          b.windowStart === w.windowStart &&
          b.windowEnd === w.windowEnd &&
          b.status === 'HELD' &&
          b.heldByToken === token
      )

      return {
        ...w,
        available: !activeHold,
        heldByMe: !!myHold && !!myHold.heldUntil && myHold.heldUntil > now,
        heldUntil: myHold?.heldUntil ?? null,
      }
    }).filter(Boolean)

    return {
      id: slot.id,
      date: slot.date.toISOString(),
      startTime: slot.startTime,
      endTime: slot.endTime,
      windows: windowsWithStatus,
    }
  }).filter(s => s.windows.length > 0)

  return NextResponse.json({ slots, jobTypeName: lead.jobType.name, durationMinutes })
}
