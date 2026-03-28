import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; typeId: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, typeId } = await params
  const body = await request.json()
  const updateData: Record<string, unknown> = {}
  if (body.name !== undefined) updateData.name = body.name
  if (body.durationMinutes !== undefined) updateData.durationMinutes = parseInt(body.durationMinutes)

  const jobType = await prisma.jobType.update({
    where: { id: typeId, campaignId: id },
    data: updateData,
  })
  return NextResponse.json(jobType)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; typeId: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, typeId } = await params
  await prisma.jobType.delete({ where: { id: typeId, campaignId: id } })
  return NextResponse.json({ ok: true })
}
