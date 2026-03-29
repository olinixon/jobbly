import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { saveFile } from '@/lib/fileStorage'
import { sendQuoteEmail, sendMissingEmailAlert } from '@/lib/notifications'
import { parseQuotePdf } from '@/lib/parseQuotePdf'
import { validateQuotePdf } from '@/lib/validateQuotePdf'
import { randomUUID } from 'crypto'

const MAX_SIZE = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const quoteNumber = formData.get('quoteNumber') as string | null
  const isReplace = formData.get('replace') === 'true'
  const skipValidation = formData.get('skip_validation') === 'true'

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

  if (!isReplace && lead.status !== 'LEAD_RECEIVED') {
    return NextResponse.json({ error: 'Quote can only be uploaded for a lead in Lead Received status.' }, { status: 400 })
  }
  if (isReplace && (lead.status === 'LEAD_RECEIVED' || lead.status === 'JOB_COMPLETED')) {
    return NextResponse.json({ error: 'Replace quote is only available for Quote Sent or Job Booked status.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileName = `quote-${quoteNumber}-${Date.now()}.pdf`

  let quoteUrl: string
  try {
    quoteUrl = await saveFile(buffer, fileName, 'application/pdf')
  } catch {
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }

  const pdfBase64 = buffer.toString('base64')

  // AI customer validation — runs unless skip_validation is set
  if (!skipValidation) {
    const validation = await validateQuotePdf(pdfBase64, {
      customer_name: lead.customerName,
      property_address: lead.propertyAddress,
      quote_number: lead.quoteNumber,
    })
    if (!validation.valid && validation.confidence === 'high') {
      return NextResponse.json({
        success: false,
        error: 'quote_mismatch',
        message: `Quote details don't match this customer. Please check you've uploaded the correct file.`,
        extracted_name: validation.extracted_name,
        extracted_address: validation.extracted_address,
        extracted_quote_number: validation.extracted_quote_number,
      }, { status: 422 })
    }
  }

  // Fetch campaign job types for AI parsing
  const campaignJobTypes = await prisma.jobType.findMany({
    where: { campaignId: lead.campaignId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, durationMinutes: true, sortOrder: true },
  })

  const parsedOptions = await parseQuotePdf(pdfBase64, campaignJobTypes)
  const now = new Date()

  if (isReplace) {
    // Re-upload: update quote fields only, no status change, no email
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        quoteUrl,
        quoteUploadedAt: now,
        quoteUploadedBy: session.user.name ?? session.user.id,
        quoteOptions: parsedOptions.length > 0 ? (parsedOptions as object[]) : undefined,
        ...(skipValidation ? { quoteValidationOverridden: true } : {}),
      },
    })
    return NextResponse.json({ ok: true, quoteUrl, replaced: true })
  }

  // Initial upload: change status, create audit log, send email
  const bookingToken = randomUUID()

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        quoteUrl,
        quoteUploadedAt: now,
        quoteUploadedBy: session.user.name ?? session.user.id,
        quoteOptions: parsedOptions.length > 0 ? (parsedOptions as object[]) : undefined,
        ...(skipValidation ? { quoteValidationOverridden: true } : {}),
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

  return NextResponse.json({ ok: true, quoteUrl, bookingToken, parsedOptionsCount: parsedOptions.length })
}
