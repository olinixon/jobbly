import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const updateData: Record<string, unknown> = {}
  if (body.name !== undefined) updateData.name = body.name
  if (body.industry !== undefined) updateData.industry = body.industry
  if (body.clientCompanyName !== undefined) updateData.clientCompanyName = body.clientCompanyName
  if (body.subcontractorCompanyName !== undefined) updateData.subcontractorCompanyName = body.subcontractorCompanyName
  if (body.status !== undefined) updateData.status = body.status
  if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate)
  if (body.markupPercentage !== undefined) updateData.markupPercentage = body.markupPercentage
  if (body.commissionPercentage !== undefined) {
    updateData.commissionPercentage = body.commissionPercentage
    updateData.clientMarginPercentage = 100 - body.commissionPercentage
  }
  if ('customer_from_email' in body) updateData.customer_from_email = body.customer_from_email ?? null
  if ('customer_from_name' in body) updateData.customer_from_name = body.customer_from_name ?? null

  const campaign = await prisma.campaign.update({ where: { id }, data: updateData })
  return NextResponse.json(campaign)
}
