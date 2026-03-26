import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('search') ?? ''
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const campaignId = session.user.campaignId

  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId
  if (search) {
    where.OR = [
      { lead: { quoteNumber: { contains: search } } },
      { changedByName: { contains: search } },
    ]
  }
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: { lead: { select: { quoteNumber: true, customerName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(logs)
}
