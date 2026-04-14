import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { buildPaymentReminderEmail } from '@/lib/buildPaymentReminderEmail'

const resend = new Resend(process.env.RESEND_API_KEY)

const DAY_5_MS = 5 * 24 * 60 * 60 * 1000
const DAY_7_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin notification preferences once — applies to all leads processed
  const adminPrefs = await prisma.user.findFirst({
    where: { role: 'ADMIN', notify_payment_reminder: true },
    select: { id: true },
  })
  const sendReminders = !!adminPrefs

  const adminAlertPrefs = await prisma.user.findFirst({
    where: { role: 'ADMIN', notify_payment_overdue: true },
    select: { id: true },
  })
  const sendAlerts = !!adminAlertPrefs

  if (!sendReminders && !sendAlerts) {
    return NextResponse.json({ reminders_sent: 0, alerts_sent: 0 })
  }

  // Find all completed leads with email sent but not yet paid
  const leads = await prisma.lead.findMany({
    where: {
      status: 'JOB_COMPLETED',
      customerEmail: { not: null },
      customerEmailSentAt: { not: null },
      customer_paid_at: null,
      customerPortalToken: { not: null },
      is_test: false,
    },
    select: {
      id: true,
      quoteNumber: true,
      customerName: true,
      customerEmail: true,
      propertyAddress: true,
      invoiceUrl: true,
      jobReportUrl: true,
      customerPortalToken: true,
      customerEmailSentAt: true,
      invoiceTotalGstInclusive: true,
      customerPrice: true,
      notes: true,
      payment_reminder_sent_at: true,
      payment_overdue_alerted_at: true,
      campaignId: true,
      campaign: { select: { clientCompanyName: true } },
    },
  })

  const now = Date.now()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const today = new Date().toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  let remindersSent = 0
  let alertsSent = 0

  for (const lead of leads) {
    const sentAt = lead.customerEmailSentAt!.getTime()
    const age = now - sentAt

    // ── Day 5 customer reminder ───────────────────────────────────────────────
    if (sendReminders && age >= DAY_5_MS && !lead.payment_reminder_sent_at) {
      const portalUrl = `${appUrl}/portal/${lead.customerPortalToken}`
      try {
        const { subject, html, attachments, attachmentNotes } = await buildPaymentReminderEmail(
          lead,
          lead.campaign,
          portalUrl
        )
        await resend.emails.send({
          from: process.env.EMAIL_FROM!,
          to: lead.customerEmail!,
          subject,
          html,
          attachments,
        })
        const notesUpdate = attachmentNotes
          ? { notes: (lead.notes ?? '') + attachmentNotes }
          : {}
        await prisma.lead.update({
          where: { id: lead.id },
          data: { payment_reminder_sent_at: new Date(), ...notesUpdate },
        })
        remindersSent++
      } catch (err) {
        console.error(`[payment-followup] Day 5 reminder failed for ${lead.quoteNumber}:`, err)
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            payment_reminder_sent_at: new Date(),
            notes: (lead.notes ?? '') + `\n[Payment Reminder Error — ${today}] Failed to send Day 5 reminder.`,
          },
        }).catch(() => {})
      }
    }

    // ── Day 7 admin alert ─────────────────────────────────────────────────────
    if (sendAlerts && age >= DAY_7_MS && !lead.payment_overdue_alerted_at) {
      const portalUrl = `${appUrl}/portal/${lead.customerPortalToken}`
      const emailOli = process.env.EMAIL_OLI
      if (!emailOli) {
        console.error('[payment-followup] EMAIL_OLI not set — cannot send Day 7 alert')
      } else {
        const sentAtFormatted = lead.customerEmailSentAt!.toLocaleDateString('en-NZ', {
          timeZone: 'Pacific/Auckland',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
        const amount = lead.invoiceTotalGstInclusive
          ?? (lead.customerPrice != null ? lead.customerPrice * 1.15 : null)

        try {
          await resend.emails.send({
            from: process.env.EMAIL_FROM!,
            to: emailOli,
            subject: `Payment overdue — ${lead.quoteNumber} — ${lead.customerName}`,
            html: `<pre style="font-family:monospace;font-size:14px;line-height:1.6;">Hi Oli,

A customer invoice is now 7 days overdue and has not been paid.

Quote number:     ${lead.quoteNumber}
Customer name:    ${lead.customerName}
Property address: ${lead.propertyAddress}
Customer email:   ${lead.customerEmail ?? '—'}
Invoice sent:     ${sentAtFormatted}
Amount:           ${amount != null ? `$${amount.toFixed(2)} (incl. GST)` : '—'}

Portal link (send to customer if needed):
${portalUrl}

Please follow up with the customer directly.

Jobbly by Omniside AI</pre>`,
          })
        } catch (err) {
          console.error(`[payment-followup] Day 7 alert failed for ${lead.quoteNumber}:`, err)
        }
        // Mark alerted regardless of email success
        await prisma.lead.update({
          where: { id: lead.id },
          data: { payment_overdue_alerted_at: new Date() },
        }).catch(() => {})
        alertsSent++
      }
    }
  }

  return NextResponse.json({ reminders_sent: remindersSent, alerts_sent: alertsSent })
}
