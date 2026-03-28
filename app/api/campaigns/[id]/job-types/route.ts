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
  const jobTypes = await prisma.jobType.findMany({
    where: { campaignId: id },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(jobTypes)
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
  const { name, durationMinutes } = body
  if (!name || !durationMinutes) {
    return NextResponse.json({ error: 'Missing name or durationMinutes' }, { status: 400 })
  }

  const last = await prisma.jobType.findFirst({
    where: { campaignId: id },
    orderBy: { sortOrder: 'desc' },
  })
  const sortOrder = (last?.sortOrder ?? 0) + 1

  const jobType = await prisma.jobType.create({
    data: { campaignId: id, name, durationMinutes: parseInt(durationMinutes), sortOrder },
  })
  return NextResponse.json(jobType)
}
