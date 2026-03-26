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
  return NextResponse.json(campaign, { status: 201 })
}
