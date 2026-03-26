import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { calculateCommission } from '@/lib/calculateCommission'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.role === 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const quoteNumber = formData.get('quoteNumber') as string | null
  const contractorRateRaw = formData.get('contractorRate') as string | null

  if (!file || !quoteNumber) {
    return NextResponse.json({ error: 'Missing file or quoteNumber' }, { status: 400 })
  }

  if (!contractorRateRaw || isNaN(parseFloat(contractorRateRaw)) || parseFloat(contractorRateRaw) <= 0) {
    return NextResponse.json({ error: 'A valid contractor rate is required.' }, { status: 400 })
  }

  const contractorRate = parseFloat(contractorRateRaw)

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 10MB.' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only PDF, JPG, and PNG files are accepted.' },
      { status: 400 }
    )
  }

  const lead = await prisma.lead.findUnique({
    where: { quoteNumber },
    include: { campaign: true },
  })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const uploadDir = process.env.UPLOAD_DIR ?? './uploads'
  const ext = file.name.split('.').pop()
  const fileName = `${quoteNumber}-${Date.now()}.${ext}`
  const filePath = path.join(uploadDir, fileName)

  try {
    await mkdir(uploadDir, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)
  } catch {
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }

  const fileUrl = `/uploads/${fileName}`

  const commission = calculateCommission({
    contractorRate,
    markupPercentage: lead.campaign.markupPercentage,
    commissionPercentage: lead.campaign.commissionPercentage,
  })

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        invoiceUrl: fileUrl,
        invoiceUploadedAt: new Date(),
        invoiceUploadedById: session.user.id,
        contractorRate,
        customerPrice: commission.customerPrice,
        grossMarkup: commission.grossMarkup,
        omnisideCommission: commission.omnisideCommission,
        clientMargin: commission.clientMargin,
      },
    }),
    prisma.attachment.create({
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        uploadedByUserId: session.user.id,
        fileName: file.name,
        fileType: file.type,
        fileUrl,
        fileSizeBytes: file.size,
        attachmentType: 'INVOICE',
      },
    }),
  ])

  return NextResponse.json({ success: true, fileUrl, commission })
}
