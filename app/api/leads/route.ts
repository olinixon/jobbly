import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, campaignId, id: userId } = session.user
  const url = new URL(request.url)
  const search = url.searchParams.get('search') ?? ''
  const status = url.searchParams.get('status') ?? ''
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const page = parseInt(url.searchParams.get('page') ?? '1')
  const pageSize = 50

  const scopeCampaignId = role === 'ADMIN'
    ? (url.searchParams.get('campaignId') ?? session.user.campaignId)
    : campaignId

  const where: Record<string, unknown> = {}
  if (scopeCampaignId) where.campaignId = scopeCampaignId

  if (search) {
    where.OR = [
      { quoteNumber: { contains: search } },
      { customerName: { contains: search } },
      { propertyAddress: { contains: search } },
    ]
  }
  if (status) where.status = status
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  // Two-tier sort at DB level: active leads first (oldest first), completed last (oldest first)
  // Fetch two groups then combine — ensures correct pagination
  const [activeLeads, completedLeads, total] = await Promise.all([
    prisma.lead.findMany({ where: { ...where, status: { not: 'JOB_COMPLETED' } }, orderBy: { createdAt: 'asc' } }),
    prisma.lead.findMany({ where: { ...where, status: 'JOB_COMPLETED' }, orderBy: { createdAt: 'asc' } }),
    prisma.lead.count({ where }),
  ])
  const allLeads = [...activeLeads, ...completedLeads]
  const leads = allLeads.slice((page - 1) * pageSize, page * pageSize)

  return NextResponse.json({ leads, total, page, pageSize })
}
