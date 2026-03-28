import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFileBuffer } from '@/lib/fileStorage'
import { sendQuoteReminder24h, sendQuoteFinalReminder } from '@/lib/notifications'

// POST /api/cron/process-emails
// Triggered every 15 minutes via Vercel cron (see vercel.json).
// Can also be triggered manually in development:
//   curl -X POST http://localhost:3000/api/cron/process-emails
export async function POST() {
  const now = new Date()

  const pending = await prisma.scheduledEmail.findMany({
    where: {
      sent: false,
      cancelled: false,
      scheduledFor: { lte: now },
    },
    include: { lead: true },
  })

  let processed = 0
  let skipped = 0

  for (const email of pending) {
    const lead = email.lead

    // Skip if lead is no longer QUOTE_SENT (booked, completed, or reverted)
    if (lead.status !== 'QUOTE_SENT') {
      await prisma.scheduledEmail.update({ where: { id: email.id }, data: { cancelled: true } })
      skipped++
      continue
    }

    // Skip if no customer email
    if (!lead.customerEmail) {
      await prisma.scheduledEmail.update({ where: { id: email.id }, data: { cancelled: true } })
      skipped++
      continue
    }

    if (!lead.bookingToken) {
      skipped++
      continue
    }

    try {
      let pdfBuffer: Buffer | undefined
      let pdfFileName: string | undefined

      if (lead.quoteUrl) {
        try {
          pdfBuffer = await getFileBuffer(lead.quoteUrl)
          pdfFileName = `quote-${lead.quoteNumber}.pdf`
        } catch {
          // Send without attachment if file unavailable
        }
      }

      const emailParams = {
        to: lead.customerEmail,
        customerName: lead.customerName,
        propertyAddress: lead.propertyAddress,
        quoteNumber: lead.quoteNumber,
        customerPrice: lead.customerPrice,
        bookingToken: lead.bookingToken,
        pdfBuffer,
        pdfFileName,
      }

      if (email.emailType === 'quote_reminder_24h') {
        await sendQuoteReminder24h(emailParams)
      } else if (email.emailType === 'quote_reminder_final') {
        await sendQuoteFinalReminder(emailParams)
      }

      await prisma.scheduledEmail.update({ where: { id: email.id }, data: { sent: true } })
      processed++
    } catch (err) {
      console.error(`Failed to process scheduled email ${email.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, processed, skipped })
}
