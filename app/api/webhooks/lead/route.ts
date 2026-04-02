import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mapWebhookPayload } from '@/lib/webhookFieldMap'
import { generateQuoteNumber } from '@/lib/generateQuoteNumber'
import { generateMapsUrl } from '@/lib/generateMapsUrl'
import { calculateCommission } from '@/lib/calculateCommission'
import { sendNewLeadEmail } from '@/lib/notifications'
import { parseStoreys } from '@/lib/parseStoreys'
import { normalisePhone } from '@/lib/normalisePhone'
import { detectDuplicate } from '@/lib/detectDuplicate'

const toStringOrNull = (val: unknown): string | null =>
  typeof val === 'string' && val.trim() !== '' ? val.trim() : null;

const toFloatOrNull = (val: unknown): number | null => {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
};

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

  const customerName = toStringOrNull(mapped['customer_name'])
  const customerPhone = normalisePhone(mapped['customer_phone'] as string | null | undefined)
  const propertyAddress = toStringOrNull(mapped['property_address'])
  const customerEmail = toStringOrNull(mapped['customer_email'])
  const propertyPerimeterM = toFloatOrNull(mapped['property_perimeter_m'])
  const propertyAreaM2 = toFloatOrNull(mapped['property_area_m2'])
  const propertyStoreys = parseStoreys(mapped['property_storeys'] as string | number | null | undefined)
  const gutterGuards = toStringOrNull(mapped['gutter_guards'])
  const storeyCount = toStringOrNull(mapped['storey_count'])
  const contractorRate = toFloatOrNull(mapped['contractor_rate'])
  const callTimestamp = toStringOrNull(mapped['call_timestamp'])
  const incomingNotes = toStringOrNull(mapped['notes'])

  const missingFields: string[] = []
  if (!customerName) missingFields.push('customer_name')
  if (!customerPhone) missingFields.push('customer_phone')
  if (!propertyAddress) missingFields.push('property_address')

  // Use the incoming quote number if valid — guard against unevaluated n8n template expressions
  const rawQuoteNumber = mapped['quote_number']
  const isTemplate = typeof rawQuoteNumber === 'string' && rawQuoteNumber.includes('{{')
  const quoteNumber = (rawQuoteNumber && !isTemplate)
    ? String(rawQuoteNumber).trim()
    : await generateQuoteNumber(campaign.id)
  const googleMapsUrl = propertyAddress ? generateMapsUrl(propertyAddress) : ''

  let financials = {}
  if (contractorRate != null) {
    financials = calculateCommission({
      contractorRate,
      markupPercentage: campaign.markupPercentage,
      commissionPercentage: campaign.commissionPercentage,
    })
  }

  try {
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
        gutter_guards: gutterGuards ?? null,
        storey_count: storeyCount ?? null,
        contractorRate: contractorRate ?? null,
        ...(contractorRate != null ? financials : {}),
        status: 'LEAD_RECEIVED',
        source: 'n8n_webhook',
        webhookRaw: JSON.stringify(raw),
        needsReview: missingFields.length > 0,
        notes: (() => {
          const systemNote = missingFields.length > 0
            ? `Missing fields: ${missingFields.join(', ')}${campaign.status === 'PAUSED' ? ' (received while campaign paused)' : ''}`
            : campaign.status === 'PAUSED'
            ? 'Received while campaign paused.'
            : null
          return [incomingNotes, systemNote].filter(Boolean).join('\n\n') || null
        })(),
        createdAt: callTimestamp ? new Date(callTimestamp) : new Date(),
      },
    })

    // Fire-and-forget email to eligible subcontractors
    ;(async () => {
      try {
        const recipients = await prisma.user.findMany({
          where: { campaignId: campaign.id, role: 'SUBCONTRACTOR', isActive: true, notifyNewLead: true },
          select: { email: true, name: true },
        })
        if (recipients.length > 0) {
          await sendNewLeadEmail({
            recipients,
            quoteNumber,
            customerName: lead.customerName,
            propertyAddress: lead.propertyAddress,
            googleMapsUrl: lead.googleMapsUrl,
            storeyCount: lead.storey_count,
            gutterGuards: lead.gutter_guards,
          })
        }
      } catch (err) {
        console.error('New lead email failed:', err)
      }
    })()

    // Duplicate detection — after lead created and emails fired
    ;(async () => {
      try {
        const duplicate = await detectDuplicate(
          lead.customerPhone,
          lead.propertyAddress,
          lead.id
        )
        if (duplicate) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              duplicate_confidence: duplicate.confidence,
              duplicate_reason: duplicate.reason,
              duplicate_lead_id: duplicate.matched_quote_number,
            },
          })
        }
      } catch (err) {
        console.error('Duplicate detection failed:', err)
      }
    })()

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
  } catch (err: unknown) {
    const prismaErr = err as { code?: string; meta?: { target?: string[] } }
    if (prismaErr?.code === 'P2002' && prismaErr?.meta?.target?.includes('quoteNumber')) {
      return NextResponse.json(
        { success: false, message: `Lead with quote number ${quoteNumber} already exists` },
        { status: 409 }
      )
    }
    console.error('Webhook lead creation failed:', err, 'Payload:', JSON.stringify(raw))
    return NextResponse.json(
      { success: false, message: 'Internal server error — lead not created' },
      { status: 500 }
    )
  }
}
