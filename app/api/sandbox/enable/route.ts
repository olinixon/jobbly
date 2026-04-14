import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'
import { generateQuoteNumber } from '@/lib/generateQuoteNumber'
import { generateMapsUrl } from '@/lib/generateMapsUrl'

export async function POST(_request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const campaignId = await getActiveCampaignId(session.user.campaignId, session.user.role)
  if (!campaignId) return NextResponse.json({ error: 'No active campaign' }, { status: 400 })

  // Hard-delete any existing test lead for this campaign
  await prisma.lead.deleteMany({ where: { campaignId, is_test: true } })

  // Auto-generate quote number
  const quoteNumber = await generateQuoteNumber(campaignId)
  const propertyAddress = '1 Test Street, Auckland 1010'
  const googleMapsUrl = generateMapsUrl(propertyAddress)

  const lead = await prisma.lead.create({
    data: {
      campaignId,
      quoteNumber,
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      customerPhone: '021 000 0000',
      propertyAddress,
      googleMapsUrl,
      status: 'LEAD_RECEIVED',
      source: 'sandbox',
      contractorRate: 200.00,
      customerPrice: 250.00,
      grossMarkup: 50.00,
      omnisideCommission: 20.00,
      clientMargin: 30.00,
      notes: 'This is a sandbox test lead. No real emails or payments will be processed.',
      is_test: true,
    },
  })

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { sandbox_active: true },
  })

  return NextResponse.json({ success: true, lead: { quoteNumber: lead.quoteNumber } })
}
