import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendAdminInvoiceReminder, sendClientInvoiceReminder } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  const dayOfMonth = today.getDate()

  // Find all users with a reminder set for today
  const users = await prisma.user.findMany({
    where: { invoice_reminder_day: dayOfMonth },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      campaignId: true,
    },
  })

  if (users.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sent = 0

  for (const user of users) {
    if (!user.email || !user.campaignId) continue

    try {
      if (user.role === 'ADMIN') {
        // Count unreconciled jobs (completed leads not in any batch)
        const unreconciledCount = await prisma.lead.count({
          where: {
            campaignId: user.campaignId,
            status: 'JOB_COMPLETED',
            reconciliationBatchId: null,
          },
        })

        const campaign = await prisma.campaign.findUnique({
          where: { id: user.campaignId },
          select: { name: true },
        })

        await sendAdminInvoiceReminder({
          to: user.email,
          name: user.name,
          campaignName: campaign?.name ?? user.campaignId,
          unreconciledCount,
        })
        sent++
      } else if (user.role === 'CLIENT') {
        // Count reconciled batches with no client invoice sent
        const unsentBatchCount = await prisma.reconciliationBatch.count({
          where: {
            campaignId: user.campaignId,
            client_stripe_invoice_id: null,
          },
        })

        const campaign = await prisma.campaign.findUnique({
          where: { id: user.campaignId },
          select: { name: true },
        })

        await sendClientInvoiceReminder({
          to: user.email,
          name: user.name,
          campaignName: campaign?.name ?? user.campaignId,
          unsentBatchCount,
        })
        sent++
      }
    } catch (err) {
      console.error(`[invoice-reminders] Failed to send reminder to ${user.email}:`, err)
    }
  }

  return NextResponse.json({ sent })
}
