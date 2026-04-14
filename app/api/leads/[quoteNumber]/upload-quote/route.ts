import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { saveFile } from '@/lib/fileStorage'
import { validateQuotePdf } from '@/lib/validateQuotePdf'

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES: Record<string, 'application/pdf' | 'image/jpeg' | 'image/png'> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'SUBCONTRACTOR'].includes(session.user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { quoteNumber } = await params

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_file' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const overrideValidation = formData.get('overrideValidation') === 'true'

  if (!file) {
    return NextResponse.json({ success: false, error: 'invalid_file' }, { status: 400 })
  }

  const mediaType = ALLOWED_TYPES[file.type]
  if (!mediaType) {
    return NextResponse.json({ success: false, error: 'invalid_file' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ success: false, error: 'invalid_file' }, { status: 400 })
  }

  // Fetch lead first — confirm it exists and belongs to user's campaign
  const lead = await prisma.lead.findUnique({ where: { quoteNumber } })
  if (!lead) {
    return NextResponse.json({ success: false, error: 'lead_not_found' }, { status: 404 })
  }
  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // Upload to R2 first — keep the file regardless of validation outcome
  const buffer = Buffer.from(await file.arrayBuffer())
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const r2Key = `quotes/${quoteNumber}/${timestamp}-${safeName}`

  let quoteUrl: string
  try {
    quoteUrl = await saveFile(buffer, r2Key, mediaType)
  } catch {
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 })
  }

  // Run AI validation unless override is set
  if (!overrideValidation) {
    const fileBase64 = buffer.toString('base64')
    try {
      const validation = await validateQuotePdf(
        fileBase64,
        { customer_name: lead.customerName, property_address: lead.propertyAddress, quote_number: lead.quoteNumber },
        mediaType
      )

      if (!validation.valid && validation.confidence === 'high') {
        // Return 422 with mismatch data — R2 file is kept so override can re-use the URL
        return NextResponse.json({
          success: false,
          error: 'quote_mismatch',
          extracted_address: validation.extracted_address,
          extracted_quote_number: validation.extracted_quote_number,
          expected_address: lead.propertyAddress,
          expected_quote_number: lead.quoteNumber,
          // Pass the uploaded URL so frontend can re-submit with override
          uploaded_url: quoteUrl,
        }, { status: 422 })
      }
    } catch (err) {
      // AI failure — log and proceed (never block upload)
      console.error('[upload-quote] AI validation failed:', err)
    }
  }

  // Save to lead
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      quoteUrl,
      quoteUploadedAt: new Date(),
      quoteUploadedBy: session.user.name ?? session.user.id,
      ...(overrideValidation ? { quoteValidationOverridden: true } : {}),
    },
  })

  return NextResponse.json({ success: true, quote_url: quoteUrl })
}
