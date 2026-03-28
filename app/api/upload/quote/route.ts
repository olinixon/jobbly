import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { saveFile } from '@/lib/fileStorage'
import { sendQuoteEmail, sendMissingEmailAlert } from '@/lib/notifications'
import { randomUUID } from 'crypto'

const MAX_SIZE = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const quoteNumber = formData.get('quoteNumber') as string | null
  const jobTypeId = formData.get('jobTypeId') as string | null

  if (!file || !quoteNumber || !jobTypeId) {
    return NextResponse.json({ error: 'Missing file, quoteNumber or jobTypeId' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 10MB.' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted.' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({ where: { quoteNumber } })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (lead.status !== 'LEAD_RECEIVED') {
    return NextResponse.json({ error: 'Quote can only be uploaded for a lead in Lead Received status.' }, { status: 400 })
  }

  const jobType = await prisma.jobType.findFirst({ where: { id: jobTypeId, campaignId: lead.campaignId } })
  if (!jobType) return NextResponse.json({ error: 'Invalid job type' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileName = `quote-${quoteNumber}-${Date.now()}.pdf`

  let quoteUrl: string
  try {
    quoteUrl = await saveFile(buffer, fileName, 'application/pdf')
  } catch {
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }

  const bookingToken = randomUUID()
  const now = new Date()
  const reminderIn24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const reminderIn5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        quoteUrl,
        quoteUploadedAt: now,
        quoteUploadedBy: session.user.name ?? session.user.id,
        jobTypeId,
        status: 'QUOTE_SENT',
        bookingToken,
      },
    }),
    prisma.auditLog.create({
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        changedByUserId: session.user.id,
        changedByName: session.user.name ?? session.user.role,
        oldStatus: 'LEAD_RECEIVED',
        newStatus: 'QUOTE_SENT',
      },
    }),
    ...(lead.customerEmail ? [
      prisma.scheduledEmail.create({
        data: { leadId: lead.id, emailType: 'quote_reminder_24h', scheduledFor: reminderIn24h },
      }),
      prisma.scheduledEmail.create({
        data: { leadId: lead.id, emailType: 'quote_reminder_final', scheduledFor: reminderIn5Days },
      }),
    ] : []),
  ])

  // Fire-and-forget emails (don't block the response)
  if (lead.customerEmail) {
    ;(async () => {
      try {
        await sendQuoteEmail({
          to: lead.customerEmail!,
          customerName: lead.customerName,
          propertyAddress: lead.propertyAddress,
          quoteNumber: lead.quoteNumber,
          customerPrice: lead.customerPrice,
          bookingToken,
          pdfBuffer: buffer,
          pdfFileName: fileName,
        })
      } catch (err) {
        console.error('Quote email send failed:', err)
      }
    })()
  } else {
    ;(async () => {
      try {
        await sendMissingEmailAlert({
          quoteNumber: lead.quoteNumber,
          customerName: lead.customerName,
          propertyAddress: lead.propertyAddress,
        })
      } catch (err) {
        console.error('Missing email alert failed:', err)
      }
    })()
  }

  return NextResponse.json({ ok: true, quoteUrl, bookingToken })
}
