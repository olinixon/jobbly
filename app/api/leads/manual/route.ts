import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalisePhone } from '@/lib/normalisePhone'
import { generateMapsUrl } from '@/lib/generateMapsUrl'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'
import { sendNewLeadEmail } from '@/lib/notifications'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaignId = await getActiveCampaignId(session.user.campaignId, session.user.role)
  if (!campaignId) return NextResponse.json({ success: false, message: 'No active campaign.' }, { status: 400 })

  const body = await request.json()
  const {
    quote_number,
    customer_name,
    customer_phone,
    customer_email,
    property_address,
    gutter_guards,
    property_storeys,
    notes,
  } = body

  // Required field validation
  if (!quote_number?.trim() || !customer_name?.trim() || !customer_phone?.trim() ||
      !customer_email?.trim() || !property_address?.trim() || !gutter_guards) {
    return NextResponse.json({ success: false, message: 'Missing required fields.' }, { status: 400 })
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(customer_email.trim())) {
    return NextResponse.json({ success: false, message: 'Invalid email address.' }, { status: 400 })
  }

  // Duplicate quote number check
  const existing = await prisma.lead.findUnique({ where: { quoteNumber: quote_number.trim() } })
  if (existing) {
    return NextResponse.json({ success: false, message: 'A lead with this quote number already exists.' }, { status: 409 })
  }

  const phone = normalisePhone(customer_phone.trim()) ?? customer_phone.trim()
  const googleMapsUrl = generateMapsUrl(property_address.trim())

  try {
    const lead = await prisma.lead.create({
      data: {
        campaignId,
        quoteNumber: quote_number.trim(),
        customerName: customer_name.trim(),
        customerPhone: phone,
        customerEmail: customer_email.trim(),
        propertyAddress: property_address.trim(),
        googleMapsUrl,
        gutter_guards,
        storey_count: property_storeys?.trim() || null,
        notes: notes?.trim() || null,
        status: 'LEAD_RECEIVED',
        source: 'manual',
      },
    })

    // Audit log — records manual creation
    await prisma.auditLog.create({
      data: {
        leadId: lead.id,
        campaignId,
        changedByUserId: session.user.id,
        changedByName: session.user.name,
        oldStatus: 'LEAD_RECEIVED',
        newStatus: 'LEAD_RECEIVED',
      },
    })

    // Fire-and-forget: notify subcontractors
    ;(async () => {
      try {
        const recipients = await prisma.user.findMany({
          where: { campaignId, role: 'SUBCONTRACTOR', isActive: true, notifyNewLead: true },
          select: { email: true, name: true },
        })
        if (recipients.length > 0) {
          await sendNewLeadEmail({
            recipients,
            quoteNumber: lead.quoteNumber,
            customerName: lead.customerName,
            propertyAddress: lead.propertyAddress,
            googleMapsUrl: lead.googleMapsUrl,
            storeyCount: lead.storey_count,
            gutterGuards: lead.gutter_guards,
          })
        }
      } catch (err) {
        console.error('New lead email (manual) failed:', err)
      }
    })()

    return NextResponse.json({ success: true, quote_number: lead.quoteNumber })
  } catch (err) {
    console.error('Manual lead creation failed:', err)
    return NextResponse.json({ success: false, message: 'Failed to create lead.' }, { status: 500 })
  }
}
