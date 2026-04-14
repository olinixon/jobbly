// Daily cron — runs at 0 20 * * * (8:00 AM NZST)
// Protected by CRON_SECRET. Called by Vercel cron scheduler.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkMyobInvoiceStatus } from '@/lib/myob/checkMyobInvoiceStatus'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ─── MYOB payment polling ────────────────────────────────────────────────────

  const myobUnpaidLeads = await prisma.lead.findMany({
    where: {
      myob_invoice_id: { not: null },
      customer_paid_at: null,
      is_test: false,
      jobCompletedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      quoteNumber: true,
      myob_invoice_id: true,
      campaignId: true,
      notes: true,
    },
  })

  console.log(`[MYOB Cron] Checking ${myobUnpaidLeads.length} unpaid invoices`)

  let confirmed = 0
  let failed = 0

  for (const lead of myobUnpaidLeads) {
    try {
      const { isPaid } = await checkMyobInvoiceStatus(lead.campaignId, lead.myob_invoice_id!)

      if (isPaid) {
        const paidAt = new Date()
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            customer_paid_at: paidAt,
            // Append to notes — do NOT write to audit_log (status-changes only)
            notes: `${lead.notes ?? ''}\n[Payment confirmed via MYOB — ${paidAt.toISOString()}]`.trim(),
          },
        })
        console.log(`[MYOB Cron] Confirmed paid: ${lead.quoteNumber}`)
        confirmed++
      }
    } catch (error) {
      // Log but do not throw — one failure must not block others
      console.error(`[MYOB Cron] Failed: ${lead.quoteNumber}`, error)
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    myob_checked: myobUnpaidLeads.length,
    myob_confirmed: confirmed,
    myob_failed: failed,
  })
}
