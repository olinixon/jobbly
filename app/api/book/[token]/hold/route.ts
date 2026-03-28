import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Basic in-memory rate limiting (works for single-server; production should use Redis)
const ipRequests = new Map<string, number[]>()
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60 * 1000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const requests = (ipRequests.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  requests.push(now)
  ipRequests.set(ip, requests)
  return requests.length > RATE_LIMIT
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { token } = await params
  const body = await request.json()
  const { slotId, windowStart, windowEnd } = body

  if (!slotId || !windowStart || !windowEnd) {
    return NextResponse.json({ error: 'slotId, windowStart, and windowEnd are required' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({ where: { bookingToken: token } })
  if (!lead) return NextResponse.json({ error: 'Invalid booking link' }, { status: 404 })

  if (lead.status === 'JOB_BOOKED' || lead.status === 'JOB_COMPLETED') {
    return NextResponse.json({ error: 'This job is already booked' }, { status: 400 })
  }

  const slot = await prisma.availabilitySlot.findFirst({
    where: { id: slotId, campaignId: lead.campaignId },
  })
  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

  const now = new Date()
  const heldUntil = new Date(now.getTime() + 10 * 60 * 1000)

  // Check if window is already confirmed by anyone
  const confirmed = await prisma.booking.findFirst({
    where: { slotId, windowStart, windowEnd, status: 'CONFIRMED' },
  })
  if (confirmed) {
    return NextResponse.json({ error: 'This time slot has already been booked' }, { status: 409 })
  }

  // Check if window is held by another customer
  const otherHold = await prisma.booking.findFirst({
    where: {
      slotId,
      windowStart,
      windowEnd,
      status: 'HELD',
      heldUntil: { gt: now },
      NOT: { heldByToken: token },
    },
  })
  if (otherHold) {
    return NextResponse.json({ error: 'This time slot is temporarily unavailable' }, { status: 409 })
  }

  // Release any previous hold by this token on ANY slot
  await prisma.booking.deleteMany({
    where: { status: 'HELD', heldByToken: token, leadId: lead.id },
  })

  // Create new hold
  await prisma.booking.create({
    data: {
      slotId,
      leadId: lead.id,
      windowStart,
      windowEnd,
      status: 'HELD',
      heldUntil,
      heldByToken: token,
    },
  })

  return NextResponse.json({ ok: true, heldUntil: heldUntil.toISOString(), windowStart, windowEnd })
}
