import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendBookingConfirmationCustomer, sendBookingNotificationPWB, sendBookingRescheduleEmail, sendBookingRescheduleConfirmationCustomer } from '@/lib/notifications'
import { generateCalendarLinks } from '@/lib/generateCalendarLinks'

function formatBookingDate(date: Date): string {
  return date.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
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
  const { slotId, windowStart, windowEnd, job_type_id, is_reschedule, old_date, old_window_start, old_window_end } = body

  if (!slotId || !windowStart || !windowEnd) {
    return NextResponse.json({ error: 'slotId, windowStart, and windowEnd are required' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({
    where: { bookingToken: token },
    include: {
      jobType: true,
      campaign: { select: { customer_from_email: true, customer_from_name: true } },
    },
  })
  if (!lead) return NextResponse.json({ error: 'Invalid booking link' }, { status: 404 })

  // For reschedule: allow JOB_BOOKED status; for initial: reject if already booked
  if (!is_reschedule && (lead.status === 'JOB_BOOKED' || lead.status === 'JOB_COMPLETED')) {
    return NextResponse.json({ error: 'This job is already booked' }, { status: 400 })
  }
  if (lead.status === 'JOB_COMPLETED') {
    return NextResponse.json({ error: 'This job is already completed' }, { status: 400 })
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
    // Upsert the booking to CONFIRMED — handles both the held booking update and edge cases
    await tx.booking.upsert({
      where: { leadId: lead.id },
      update: {
        slotId,
        windowStart,
        windowEnd,
        status: 'CONFIRMED',
        bookedAt: new Date(),
        heldUntil: null,
        heldByToken: null,
      },
      create: {
        slotId,
        leadId: lead.id,
        windowStart,
        windowEnd,
        status: 'CONFIRMED',
        bookedAt: new Date(),
      },
    })

    // Update lead — status stays JOB_BOOKED for reschedule, or moves to it for initial
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: 'JOB_BOOKED',
        jobBookedDate: slotDate,
        jobTypeId: job_type_id ?? null,
      },
    })

    if (!is_reschedule) {
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
    }
  })

  const bookingDate = formatBookingDate(slotDate)
  const windowStartFmt = fmt12h(windowStart)
  const windowEndFmt = fmt12h(windowEnd)
  const jobTypeName = lead.jobType?.name ?? 'Gutter Clean'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const slotDateNZ = slotDate.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })

  const calendarLinks = generateCalendarLinks({
    bookingToken: token,
    bookingId: booking.id,
    windowStartNZ: windowStart,
    windowEndNZ: windowEnd,
    slotDateNZ,
    propertyAddress: lead.propertyAddress,
    quoteNumber: lead.quoteNumber,
    jobTypeName,
    appUrl,
  })

  // Send confirmation emails immediately — awaited so they complete before Vercel freezes the function.
  // Wrapped in try/catch so email failure never blocks the booking success response.
  try {
    if (is_reschedule) {
      // Parallelise: send customer reschedule confirmation while fetching subcontractors
      const [, subcontractors] = await Promise.all([
        lead.customerEmail
          ? sendBookingRescheduleConfirmationCustomer({
              to: lead.customerEmail,
              customerName: lead.customerName,
              propertyAddress: lead.propertyAddress,
              quoteNumber: lead.quoteNumber,
              jobTypeName,
              newDate: bookingDate,
              newWindowStart: windowStartFmt,
              newWindowEnd: windowEndFmt,
              campaign: lead.campaign,
              bookingToken: token,
              calendarLinks,
            })
          : Promise.resolve(),
        prisma.user.findMany({
          where: { campaignId: lead.campaignId, role: 'SUBCONTRACTOR', isActive: true, notifyNewLead: true },
          select: { email: true, name: true },
        }),
      ])
      if (subcontractors.length > 0) {
        await sendBookingRescheduleEmail({
          to: subcontractors.map(u => u.email),
          recipients: subcontractors.map(u => ({ email: u.email, name: u.name })),
          quoteNumber: lead.quoteNumber,
          customerName: lead.customerName,
          propertyAddress: lead.propertyAddress,
          googleMapsUrl: lead.googleMapsUrl,
          oldDate: old_date ?? '',
          oldWindowStart: old_window_start ?? '',
          oldWindowEnd: old_window_end ?? '',
          newDate: bookingDate,
          newWindowStart: windowStart,
          newWindowEnd: windowEnd,
          calendarLinks,
        })
      }
    } else {
      // Parallelise: send customer confirmation while fetching subcontractors
      const [, subcontractors] = await Promise.all([
        lead.customerEmail
          ? sendBookingConfirmationCustomer({
              to: lead.customerEmail,
              customerName: lead.customerName,
              propertyAddress: lead.propertyAddress,
              quoteNumber: lead.quoteNumber,
              jobTypeName,
              bookingDate,
              windowStart: windowStartFmt,
              windowEnd: windowEndFmt,
              campaign: lead.campaign,
              bookingToken: token,
              calendarLinks,
            })
          : Promise.resolve(),
        prisma.user.findMany({
          where: { campaignId: lead.campaignId, role: 'SUBCONTRACTOR', isActive: true, notifyNewLead: true },
          select: { email: true },
        }),
      ])
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
          calendarLinks,
        })
      }
    }
  } catch (err) {
    console.error('Booking confirmation emails failed:', err)
  }

  return NextResponse.json({
    ok: true,
    bookingDate,
    windowStart: windowStartFmt,
    windowEnd: windowEndFmt,
  })
}
