import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { calculateCommissionFromCustomerPrice } from '@/lib/calculateCommission'
import { saveFile } from '@/lib/fileStorage'
import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

const PARSE_SYSTEM_PROMPT = `You are an invoice parser for a New Zealand business.
Extract the total amount charged EXCLUDING GST (the ex-GST subtotal) from this invoice.
If the invoice shows a GST-inclusive total only, divide by 1.15 to calculate the ex-GST amount.
Return ONLY a JSON object in this exact format, nothing else:
{ "customer_price_ex_gst": 250.00, "currency": "NZD", "gst_inclusive_total": 287.50, "confidence": "high" }
If you cannot find a clear total, return:
{ "customer_price_ex_gst": null, "currency": null, "gst_inclusive_total": null, "confidence": "low", "reason": "brief explanation" }
Do not include any other text, explanation, or markdown.`

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
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF, JPG, and PNG files are accepted.' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({
    where: { quoteNumber },
    include: { campaign: true },
  })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (lead.status !== 'JOB_BOOKED' && lead.status !== 'JOB_COMPLETED') {
    return NextResponse.json({ error: 'Invoice can only be uploaded when the job is booked or completed.' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()
  const fileName = `invoice-${quoteNumber}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  let fileUrl: string
  try {
    fileUrl = await saveFile(buffer, fileName, file.type)
  } catch {
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }

  // Call Anthropic to extract customer price
  let aiRaw: string | null = null
  let customerPrice: number | null = null
  let aiConfidence = 'low'
  let parseFailed = false

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const base64Data = buffer.toString('base64')
    const contentType = file.type as 'application/pdf' | 'image/jpeg' | 'image/png'

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: PARSE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: contentType === 'application/pdf' ? 'document' : 'image',
              source: { type: 'base64', media_type: contentType as 'application/pdf' | 'image/jpeg' | 'image/png', data: base64Data },
            } as ContentBlockParam,
            { type: 'text', text: 'Extract the ex-GST total from this invoice.' } as ContentBlockParam,
          ],
        },
      ],
    })

    aiRaw = msg.content[0].type === 'text' ? msg.content[0].text : null
    if (aiRaw) {
      const parsed = JSON.parse(aiRaw)
      aiConfidence = parsed.confidence ?? 'low'
      if (parsed.customer_price_ex_gst != null && typeof parsed.customer_price_ex_gst === 'number') {
        customerPrice = parsed.customer_price_ex_gst
      }
    }
  } catch (err) {
    console.error('AI invoice parse error:', err)
    parseFailed = true
  }

  if (customerPrice == null || aiConfidence === 'low') {
    // Fallback — return file saved, ask user to enter manually
    return NextResponse.json({
      fileUrl,
      fileName: file.name,
      fileType: file.type,
      fileSizeBytes: file.size,
      markupPercentage: lead.campaign.markupPercentage,
      commissionPercentage: lead.campaign.commissionPercentage,
      fallback: true,
      fallbackReason: parseFailed
        ? 'AI parsing failed. Please enter the customer price manually.'
        : "We couldn't read a total from this invoice. Please enter the customer price manually.",
    })
  }

  const commission = calculateCommissionFromCustomerPrice({
    customerPrice,
    markupPercentage: lead.campaign.markupPercentage,
    commissionPercentage: lead.campaign.commissionPercentage,
  })

  return NextResponse.json({
    fileUrl,
    fileName: file.name,
    fileType: file.type,
    fileSizeBytes: file.size,
    markupPercentage: lead.campaign.markupPercentage,
    commissionPercentage: lead.campaign.commissionPercentage,
    fallback: false,
    aiRaw,
    ...commission,
  })
}
