import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, slotId } = await params
  const body = await request.json()
  const { date, startTime, endTime, notes } = body

  const slot = await prisma.availabilitySlot.findFirst({
    where: { id: slotId, campaignId: id },
  })
  if (!slot) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const hasConfirmed = await prisma.booking.count({
    where: { slotId, status: 'CONFIRMED' },
  })
  if (hasConfirmed > 0) {
    return NextResponse.json({ error: 'Cannot edit a slot with confirmed bookings' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (date) updateData.date = new Date(date)
  if (startTime) updateData.startTime = startTime
  if (endTime) updateData.endTime = endTime
  if (notes !== undefined) updateData.notes = notes ?? null

  if (updateData.startTime && updateData.endTime && updateData.startTime >= updateData.endTime) {
    return NextResponse.json({ error: 'startTime must be before endTime' }, { status: 400 })
  }

  const updated = await prisma.availabilitySlot.update({
    where: { id: slotId },
    data: updateData,
  })

  return NextResponse.json({ ...updated, confirmedBookings: 0 })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, slotId } = await params

  const slot = await prisma.availabilitySlot.findFirst({
    where: { id: slotId, campaignId: id },
  })
  if (!slot) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const hasConfirmed = await prisma.booking.count({
    where: { slotId, status: 'CONFIRMED' },
  })
  if (hasConfirmed > 0) {
    return NextResponse.json({ error: 'Cannot delete a slot with confirmed bookings' }, { status: 400 })
  }

  // Release any held bookings on this slot first
  await prisma.booking.deleteMany({ where: { slotId, status: 'HELD' } })
  await prisma.availabilitySlot.delete({ where: { id: slotId } })

  return NextResponse.json({ ok: true })
}
