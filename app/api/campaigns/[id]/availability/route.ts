import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const slots = await prisma.availabilitySlot.findMany({
    where: { campaignId: id },
    orderBy: { date: 'asc' },
    include: {
      bookings: {
        where: { status: 'CONFIRMED' },
        select: { id: true },
      },
    },
  })

  return NextResponse.json(
    slots.map(s => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      notes: s.notes,
      createdAt: s.createdAt,
      confirmedBookings: s.bookings.length,
    }))
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { date, startTime, endTime, notes } = body

  if (!date || !startTime || !endTime) {
    return NextResponse.json({ error: 'date, startTime, and endTime are required' }, { status: 400 })
  }

  if (startTime >= endTime) {
    return NextResponse.json({ error: 'startTime must be before endTime' }, { status: 400 })
  }

  const slot = await prisma.availabilitySlot.create({
    data: {
      campaignId: id,
      date: new Date(date),
      startTime,
      endTime,
      notes: notes ?? null,
    },
  })

  return NextResponse.json({ ...slot, confirmedBookings: 0 }, { status: 201 })
}
