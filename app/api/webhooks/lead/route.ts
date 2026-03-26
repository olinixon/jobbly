import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mapWebhookPayload } from '@/lib/webhookFieldMap'
import { generateQuoteNumber } from '@/lib/generateQuoteNumber'
import { generateMapsUrl } from '@/lib/generateMapsUrl'
import { calculateCommission } from '@/lib/calculateCommission'
import { sendNewLeadEmail } from '@/lib/notifications'

export async function POST(request: NextRequest) {
  // Validate webhook secret
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  let raw: Record<string, unknown>
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 })
  }

  // Get the active campaign (for MVP there's one)
  const campaign = await prisma.campaign.findFirst({
    where: { status: { not: 'COMPLETED' } },
    orderBy: { createdAt: 'asc' },
  })

  if (!campaign) {
    return NextResponse.json(
      { success: false, message: 'No active campaign found' },
      { status: 400 }
    )
  }

  if (campaign.status === 'COMPLETED') {
    return NextResponse.json(
      { success: false, message: 'Campaign is no longer active' },
      { status: 400 }
    )
  }

  const mapped = mapWebhookPayload(raw)

  const customerName = mapped['customer_name'] as string | undefined
  const customerPhone = mapped['customer_phone'] as string | undefined
  const propertyAddress = mapped['property_address'] as string | undefined
  const customerEmail = mapped['customer_email'] as string | undefined
  const propertyPerimeterM = mapped['property_perimeter_m'] as number | undefined
  const propertyAreaM2 = mapped['property_area_m2'] as number | undefined
  const propertyStoreys = mapped['property_storeys'] as number | undefined
  const contractorRate = mapped['contractor_rate'] as number | undefined
  const callTimestamp = mapped['call_timestamp'] as string | undefined

  const missingFields: string[] = []
  if (!customerName) missingFields.push('customer_name')
  if (!customerPhone) missingFields.push('customer_phone')
  if (!propertyAddress) missingFields.push('property_address')

  const quoteNumber = await generateQuoteNumber(campaign.id)
  const googleMapsUrl = propertyAddress ? generateMapsUrl(propertyAddress) : ''

  let financials = {}
  if (contractorRate != null) {
    financials = calculateCommission({
      contractorRate,
      markupPercentage: campaign.markupPercentage,
      commissionPercentage: campaign.commissionPercentage,
    })
  }

  const lead = await prisma.lead.create({
    data: {
      campaignId: campaign.id,
      quoteNumber,
      customerName: customerName ?? 'Unknown',
      customerPhone: customerPhone ?? '',
      customerEmail: customerEmail ?? null,
      propertyAddress: propertyAddress ?? '',
      googleMapsUrl,
      propertyPerimeterM: propertyPerimeterM ?? null,
      propertyAreaM2: propertyAreaM2 ?? null,
      propertyStoreys: propertyStoreys ?? null,
      contractorRate: contractorRate ?? null,
      ...(contractorRate != null ? financials : {}),
      status: 'LEAD_RECEIVED',
      source: 'n8n_webhook',
      webhookRaw: JSON.stringify(raw),
      needsReview: missingFields.length > 0,
      notes: missingFields.length > 0
        ? `Received while campaign ${campaign.status === 'PAUSED' ? 'paused. ' : ''}Missing fields: ${missingFields.join(', ')}`
        : campaign.status === 'PAUSED'
        ? 'Received while campaign paused.'
        : null,
      createdAt: callTimestamp ? new Date(callTimestamp) : new Date(),
    },
  })

  // Fire-and-forget email — don't let it block the response
  sendNewLeadEmail({
    quoteNumber,
    customerName: lead.customerName,
    customerPhone: lead.customerPhone,
    propertyAddress: lead.propertyAddress,
    googleMapsUrl: lead.googleMapsUrl,
    propertyPerimeterM: lead.propertyPerimeterM,
    propertyAreaM2: lead.propertyAreaM2,
    propertyStoreys: lead.propertyStoreys,
  }).catch(console.error)

  if (missingFields.length > 0) {
    return NextResponse.json({
      success: true,
      quote_number: quoteNumber,
      message: 'Lead created with missing fields — flagged for review',
      missing_fields: missingFields,
    })
  }

  return NextResponse.json({
    success: true,
    quote_number: quoteNumber,
    message: 'Lead created successfully',
  })
}
