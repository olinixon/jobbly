import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { saveFile } from '@/lib/fileStorage'
import { sendQuoteEmail, sendMissingEmailAlert } from '@/lib/notifications'
import { parseQuotePdf } from '@/lib/parseQuotePdf'
import { randomUUID } from 'crypto'

const MAX_SIZE = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const quoteNumber = formData.get('quoteNumber') as string | null

  if (!file || !quoteNumber) {
    return NextResponse.json({ error: 'Missing file or quoteNumber' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 10MB.' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted.' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({
    where: { quoteNumber },
    include: { campaign: { select: { customer_from_email: true, customer_from_name: true } } },
  })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (lead.status !== 'LEAD_RECEIVED') {
    return NextResponse.json({ error: 'Quote can only be uploaded for a lead in Lead Received status.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileName = `quote-${quoteNumber}-${Date.now()}.pdf`

  let quoteUrl: string
  try {
    quoteUrl = await saveFile(buffer, fileName, 'application/pdf')
  } catch {
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }

  // Fetch campaign job types for matching
  const campaignJobTypes = await prisma.jobType.findMany({
    where: { campaignId: lead.campaignId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, durationMinutes: true, sortOrder: true },
  })

  // Run AI parsing — best effort, never blocks upload
  const pdfBase64 = buffer.toString('base64')
  const parsedOptions = await parseQuotePdf(pdfBase64, campaignJobTypes)

  const bookingToken = randomUUID()
  const now = new Date()

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        quoteUrl,
        quoteUploadedAt: now,
        quoteUploadedBy: session.user.name ?? session.user.id,
        quoteOptions: parsedOptions.length > 0 ? (parsedOptions as object[]) : undefined,
        // jobTypeId intentionally NOT set here — set at booking confirmation
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
  ])

  // Send quote email (fire-and-forget)
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
          campaign: lead.campaign,
          parsedOptions,
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
