import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { buildCustomerNotificationEmail } from '@/lib/buildCustomerNotificationEmail'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { quoteNumber } = await params

  const lead = await prisma.lead.findUnique({
    where: { quoteNumber },
    include: { campaign: { select: { id: true, clientCompanyName: true } } },
  })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!lead.customerPortalToken) {
    return NextResponse.json({ error: 'Customer portal has not been generated for this job yet.' }, { status: 400 })
  }
  if (!lead.customerEmail) {
    return NextResponse.json({ error: 'No customer email on file.' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const portalUrl = `${appUrl}/portal/${lead.customerPortalToken}`

  const { subject, html, attachments, attachmentNotes } = await buildCustomerNotificationEmail(
    lead,
    lead.campaign,
    portalUrl
  )

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: lead.customerEmail,
    subject,
    html,
    attachments,
  })

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      customerEmailSentAt: new Date(),
      ...(attachmentNotes ? { notes: (lead.notes ?? '') + attachmentNotes } : {}),
    },
  })

  return NextResponse.json({ success: true })
}
