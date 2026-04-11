import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { saveFile } from '@/lib/fileStorage'
import { analyzeInvoice } from '@/lib/analyzeInvoice'
import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

const CLASSIFY_PROMPT = `You are reviewing two documents uploaded for a gutter cleaning job.
Identify which is the invoice (a bill requesting payment from the customer) and which is the job report (a completion or inspection record).
Respond in JSON only — no other text:
{ "invoice": "file1" | "file2", "job_report": "file1" | "file2" }
If you cannot confidently determine which is which, respond:
{ "error": "Cannot identify documents" }`

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'SUBCONTRACTOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { quoteNumber } = await params

  const lead = await prisma.lead.findUnique({ where: { quoteNumber } })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.campaignId !== session.user.campaignId && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (lead.status !== 'JOB_BOOKED') {
    return NextResponse.json({ error: 'This job is not in the correct status.' }, { status: 400 })
  }

  const formData = await request.formData()
  const file1 = formData.get('file1') as File | null
  const file2 = formData.get('file2') as File | null

  if (!file1 || !file2) {
    return NextResponse.json({ error: 'Two files are required.' }, { status: 400 })
  }

  // Step 1 — Server-side file validation
  for (const [label, f] of [['file1', file1], ['file2', file2]] as [string, File][]) {
    const sizeMB = (f.size / (1024 * 1024)).toFixed(1)
    if (f.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `One or more files exceed the 10MB limit. ${f.name} is ${sizeMB}MB. Please reduce the file size and try again.` },
        { status: 400 }
      )
    }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_TYPES.includes(f.type)) {
      return NextResponse.json(
        { error: `One or more files are not a supported type. ${f.name} is a .${ext} file. Please upload PDFs, JPGs, or PNGs only.` },
        { status: 400 }
      )
    }
    void label // suppress unused warning
  }

  // Step 2 — Identical file check
  if (file1.name === file2.name && file1.size === file2.size) {
    return NextResponse.json(
      { error: 'Both files appear to be the same. Please select two different documents.' },
      { status: 422 }
    )
  }

  // Load both files into memory
  const [buf1, buf2] = await Promise.all([
    Buffer.from(await file1.arrayBuffer()),
    Buffer.from(await file2.arrayBuffer()),
  ])

  // Step 3 — AI classification
  let invoiceKey: 'file1' | 'file2'
  let jobReportKey: 'file1' | 'file2'

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    function toBlock(buf: Buffer, f: File): ContentBlockParam {
      const mt = f.type as 'application/pdf' | 'image/jpeg' | 'image/png'
      return {
        type: mt === 'application/pdf' ? 'document' : 'image',
        source: { type: 'base64', media_type: mt, data: buf.toString('base64') },
      } as ContentBlockParam
    }

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: CLASSIFY_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'File 1:' } as ContentBlockParam,
            toBlock(buf1, file1),
            { type: 'text', text: 'File 2:' } as ContentBlockParam,
            toBlock(buf2, file2),
            { type: 'text', text: 'Classify these two documents.' } as ContentBlockParam,
          ],
        },
      ],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : null
    if (!raw) throw new Error('No response from Claude')

    const result = JSON.parse(raw)
    if (result.error) {
      return NextResponse.json(
        { error: "We couldn't identify which file is the invoice and which is the job report. Please upload them individually." },
        { status: 422 }
      )
    }
    if (!['file1', 'file2'].includes(result.invoice) || !['file1', 'file2'].includes(result.job_report)) {
      throw new Error('Invalid classification result')
    }
    invoiceKey = result.invoice as 'file1' | 'file2'
    jobReportKey = result.job_report as 'file1' | 'file2'
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes("couldn't identify")) {
      return NextResponse.json(
        { error: "We couldn't identify which file is the invoice and which is the job report. Please upload them individually." },
        { status: 422 }
      )
    }
    console.error('[classify-documents] Classification failed:', err)
    return NextResponse.json(
      { error: "We couldn't identify which file is the invoice and which is the job report. Please upload them individually." },
      { status: 422 }
    )
  }

  const invoiceFile = invoiceKey === 'file1' ? file1 : file2
  const jobReportFile = jobReportKey === 'file1' ? file1 : file2
  const invoiceBuf = invoiceKey === 'file1' ? buf1 : buf2
  const jobReportBuf = jobReportKey === 'file1' ? buf1 : buf2

  // Step 4 — Invoice verification (concern detection only — non-blocking)
  let aiConcern: string | null = null
  const fakeUrl = invoiceFile.name // use name for extension detection
  try {
    const result = await analyzeInvoice(invoiceBuf, fakeUrl)
    aiConcern = result.concern
  } catch (err) {
    console.error('[classify-documents] Invoice analysis failed:', err)
  }

  // Step 5 — Save both files to R2
  const invoiceExt = invoiceFile.name.split('.').pop()
  const jobReportExt = jobReportFile.name.split('.').pop()
  const invoiceFileName = `invoice-${quoteNumber}-${Date.now()}.${invoiceExt}`
  const jobReportFileName = `job-reports/${lead.campaignId}/${quoteNumber}-report.${jobReportExt}`

  let invoiceUrl: string
  let jobReportUrl: string
  try {
    ;[invoiceUrl, jobReportUrl] = await Promise.all([
      saveFile(invoiceBuf, invoiceFileName, invoiceFile.type),
      saveFile(jobReportBuf, jobReportFileName, jobReportFile.type),
    ])
  } catch (err) {
    console.error('[classify-documents] File upload failed:', err)
    return NextResponse.json({ error: 'File upload failed. Please try again.' }, { status: 500 })
  }

  // Append AI concern to notes if present
  const now = new Date()
  const today = now.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric' })
  const notesAppendage = aiConcern ? `\n[AI Invoice Review — ${today}] ${aiConcern}` : ''

  // Update lead and attachments
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        invoiceUrl,
        invoiceUploadedAt: now,
        invoiceUploadedById: session.user.id,
        jobReportUrl,
        jobReportUploadedAt: now,
        jobReportUploadedBy: session.user.id,
        ...(notesAppendage ? { notes: (lead.notes ?? '') + notesAppendage } : {}),
      },
    })

    // Upsert attachments (update existing or create new)
    const existingInvoice = await tx.attachment.findFirst({
      where: { leadId: lead.id, attachmentType: 'INVOICE' },
    })
    const existingReport = await tx.attachment.findFirst({
      where: { leadId: lead.id, attachmentType: 'JOB_REPORT' },
    })

    if (existingInvoice) {
      await tx.attachment.update({
        where: { id: existingInvoice.id },
        data: { fileName: invoiceFile.name, fileType: invoiceFile.type, fileUrl: invoiceUrl, fileSizeBytes: invoiceFile.size, uploadedByUserId: session.user.id },
      })
    } else {
      await tx.attachment.create({
        data: { leadId: lead.id, campaignId: lead.campaignId, uploadedByUserId: session.user.id, fileName: invoiceFile.name, fileType: invoiceFile.type, fileUrl: invoiceUrl, fileSizeBytes: invoiceFile.size, attachmentType: 'INVOICE' },
      })
    }

    if (existingReport) {
      await tx.attachment.update({
        where: { id: existingReport.id },
        data: { fileName: jobReportFile.name, fileType: jobReportFile.type, fileUrl: jobReportUrl, fileSizeBytes: jobReportFile.size, uploadedByUserId: session.user.id },
      })
    } else {
      await tx.attachment.create({
        data: { leadId: lead.id, campaignId: lead.campaignId, uploadedByUserId: session.user.id, fileName: jobReportFile.name, fileType: jobReportFile.type, fileUrl: jobReportUrl, fileSizeBytes: jobReportFile.size, attachmentType: 'JOB_REPORT' },
      })
    }
  })

  return NextResponse.json({
    invoiceUrl,
    invoiceFileName: invoiceFile.name,
    jobReportUrl,
    jobReportFileName: jobReportFile.name,
  })
}
