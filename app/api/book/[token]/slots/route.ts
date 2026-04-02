import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { nzLocalToUtc } from '@/lib/generateCalendarLinks'

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
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { searchParams } = new URL(request.url)
  const jobTypeIdParam = searchParams.get('job_type_id')

  const lead = await prisma.lead.findUnique({
    where: { bookingToken: token },
    include: { jobType: true },
  })

  if (!lead || !lead.bookingToken) {
    return NextResponse.json({ error: 'Invalid booking link' }, { status: 404 })
  }

  // Use job_type_id from query param if provided, otherwise fall back to lead's job type or default
  let durationMinutes: number
  let jobTypeName: string

  if (jobTypeIdParam) {
    const jobType = await prisma.jobType.findFirst({
      where: { id: jobTypeIdParam, campaignId: lead.campaignId },
    })
    if (!jobType) {
      return NextResponse.json({ error: 'Invalid job type' }, { status: 400 })
    }
    durationMinutes = jobType.durationMinutes
    jobTypeName = jobType.name
  } else if (lead.jobType) {
    durationMinutes = lead.jobType.durationMinutes
    jobTypeName = lead.jobType.name
  } else {
    const defaultJobType = await prisma.jobType.findFirst({
      where: { campaignId: lead.campaignId },
      orderBy: { sortOrder: 'asc' },
    })
    if (!defaultJobType) {
      return NextResponse.json({ error: 'No job types configured for this campaign' }, { status: 400 })
    }
    durationMinutes = defaultJobType.durationMinutes
    jobTypeName = defaultJobType.name
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
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  const slots = rawSlots.map(slot => {
    const windows = generateWindows(slot.startTime, slot.endTime, durationMinutes)
    const slotDateNZ = slot.date.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })

    const windowsWithStatus = windows.map(w => {
      const confirmedBooking = slot.bookings.find(
        b => b.windowStart === w.windowStart && b.windowEnd === w.windowEnd && b.status === 'CONFIRMED'
      )
      if (confirmedBooking) return null

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

    // Filter out windows that start within 2 hours of now (NZ time)
    const futureWindows = windowsWithStatus.filter(w => {
      const windowStartUtc = nzLocalToUtc(slotDateNZ, (w as { windowStart: string }).windowStart)
      return windowStartUtc > twoHoursFromNow
    })

    return {
      id: slot.id,
      date: slot.date.toISOString(),
      startTime: slot.startTime,
      endTime: slot.endTime,
      windows: futureWindows,
    }
  }).filter(s => s.windows.length > 0)

  return NextResponse.json({ slots, jobTypeName, durationMinutes })
}
