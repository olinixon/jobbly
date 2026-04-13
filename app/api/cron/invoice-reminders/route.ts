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

  // Check if today is the last day of the month
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const isLastDayOfMonth = dayOfMonth === lastDayOfMonth

  // Match users whose reminder day is today, OR — on the last day of shorter months —
  // users whose reminder day is beyond the last day of this month (e.g. day 31 in April)
  const users = await prisma.user.findMany({
    where: isLastDayOfMonth
      ? { invoice_reminder_day: { gte: dayOfMonth } }
      : { invoice_reminder_day: dayOfMonth },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      campaignId: true,
      invoice_auto_send: true,
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
        const campaign = await prisma.campaign.findUnique({
          where: { id: user.campaignId },
          select: { name: true },
        })

        if (user.invoice_auto_send) {
          // Auto-send mode: trigger invoice send automatically
          // TODO: wire up Stripe invoice creation here when auto-send is implemented
          // For now, log and skip — auto-send infrastructure to follow
          console.log(`[invoice-reminders] Auto-send triggered for ${user.email} (campaign: ${campaign?.name})`)
        } else {
          // Manual mode: send reminder email
          const unreconciledCount = await prisma.lead.count({
            where: {
              campaignId: user.campaignId,
              status: 'JOB_COMPLETED',
              reconciliationBatchId: null,
            },
          })

          await sendAdminInvoiceReminder({
            to: user.email,
            name: user.name,
            campaignName: campaign?.name ?? user.campaignId,
            unreconciledCount,
          })
          sent++
        }
      } else if (user.role === 'CLIENT') {
        const campaign = await prisma.campaign.findUnique({
          where: { id: user.campaignId },
          select: { name: true },
        })

        if (user.invoice_auto_send) {
          // Auto-send mode: trigger invoice send automatically
          console.log(`[invoice-reminders] Auto-send triggered for ${user.email} (campaign: ${campaign?.name})`)
        } else {
          // Manual mode: send reminder email
          const unsentBatchCount = await prisma.reconciliationBatch.count({
            where: {
              campaignId: user.campaignId,
              client_stripe_invoice_id: null,
            },
          })

          await sendClientInvoiceReminder({
            to: user.email,
            name: user.name,
            campaignName: campaign?.name ?? user.campaignId,
            unsentBatchCount,
          })
          sent++
        }
      }
    } catch (err) {
      console.error(`[invoice-reminders] Failed to process reminder for ${user.email}:`, err)
    }
  }

  return NextResponse.json({ sent })
}
