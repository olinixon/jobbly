import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendBookingConfirmationCustomer, sendBookingNotificationPWB } from '@/lib/notifications'

function formatBookingDate(date: Date): string {
  return date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function fmt12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json()
  const { slotId, windowStart, windowEnd } = body

  if (!slotId || !windowStart || !windowEnd) {
    return NextResponse.json({ error: 'slotId, windowStart, and windowEnd are required' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({
    where: { bookingToken: token },
    include: { jobType: true },
  })
  if (!lead) return NextResponse.json({ error: 'Invalid booking link' }, { status: 404 })

  if (lead.status === 'JOB_BOOKED' || lead.status === 'JOB_COMPLETED') {
    return NextResponse.json({ error: 'This job is already booked' }, { status: 400 })
  }

  const now = new Date()

  // Validate the hold
  const booking = await prisma.booking.findFirst({
    where: {
      leadId: lead.id,
      slotId,
      windowStart,
      windowEnd,
      status: 'HELD',
      heldByToken: token,
      heldUntil: { gt: now },
    },
    include: { slot: true },
  })

  if (!booking) {
    return NextResponse.json({ error: 'Your reservation has expired. Please select a time again.' }, { status: 409 })
  }

  const slotDate = booking.slot.date

  await prisma.$transaction(async (tx) => {
    // Confirm the booking
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', heldUntil: null, heldByToken: null },
    })

    // Update lead status
    await tx.lead.update({
      where: { id: lead.id },
      data: { status: 'JOB_BOOKED', jobBookedDate: slotDate },
    })

    // Write audit log — find any admin user for the campaign as the actor (booking is a customer action)
    const adminUser = await tx.user.findFirst({
      where: { campaignId: lead.campaignId, role: 'ADMIN', isActive: true },
      select: { id: true },
    })
    if (adminUser) {
      await tx.auditLog.create({
        data: {
          leadId: lead.id,
          campaignId: lead.campaignId,
          changedByUserId: adminUser.id,
          changedByName: `${lead.customerName} (customer booking)`,
          oldStatus: 'QUOTE_SENT',
          newStatus: 'JOB_BOOKED',
        },
      })
    }

  })

  const bookingDate = formatBookingDate(slotDate)
  const windowStartFmt = fmt12h(windowStart)
  const windowEndFmt = fmt12h(windowEnd)
  const jobTypeName = lead.jobType?.name ?? 'Gutter Clean'

  // Fire-and-forget emails
  ;(async () => {
    try {
      if (lead.customerEmail) {
        await sendBookingConfirmationCustomer({
          to: lead.customerEmail,
          customerName: lead.customerName,
          propertyAddress: lead.propertyAddress,
          quoteNumber: lead.quoteNumber,
          jobTypeName,
          bookingDate,
          windowStart: windowStartFmt,
          windowEnd: windowEndFmt,
        })
      }

      const subcontractors = await prisma.user.findMany({
        where: { campaignId: lead.campaignId, role: 'SUBCONTRACTOR', isActive: true, notifyNewLead: true },
        select: { email: true },
      })

      if (subcontractors.length > 0) {
        await sendBookingNotificationPWB({
          to: subcontractors.map(u => u.email),
          quoteNumber: lead.quoteNumber,
          customerName: lead.customerName,
          propertyAddress: lead.propertyAddress,
          googleMapsUrl: lead.googleMapsUrl,
          jobTypeName,
          bookingDate,
          windowStart: windowStartFmt,
          windowEnd: windowEndFmt,
        })
      }
    } catch (err) {
      console.error('Booking confirmation emails failed:', err)
    }
  })()

  return NextResponse.json({
    ok: true,
    bookingDate,
    windowStart: windowStartFmt,
    windowEnd: windowEndFmt,
  })
}
