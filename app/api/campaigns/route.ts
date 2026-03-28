import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(campaigns)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const campaign = await prisma.campaign.create({
    data: {
      name: body.name,
      industry: body.industry,
      clientCompanyName: body.clientCompanyName,
      subcontractorCompanyName: body.subcontractorCompanyName,
      markupPercentage: body.markupPercentage,
      commissionPercentage: body.commissionPercentage,
      clientMarginPercentage: 100 - body.commissionPercentage,
      status: body.status ?? 'ACTIVE',
      startDate: new Date(body.startDate),
    },
  })

  await prisma.jobType.createMany({
    data: [
      { campaignId: campaign.id, name: 'Standard Gutter Clean', durationMinutes: 120, sortOrder: 1 },
      { campaignId: campaign.id, name: 'Mid-Range Clean', durationMinutes: 240, sortOrder: 2 },
      { campaignId: campaign.id, name: 'Full Service Clean', durationMinutes: 360, sortOrder: 3 },
    ],
  })

  return NextResponse.json(campaign, { status: 201 })
}
