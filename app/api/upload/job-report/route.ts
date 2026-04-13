import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { saveFile } from '@/lib/fileStorage'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'SUBCONTRACTOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  const lead = await prisma.lead.findUnique({ where: { quoteNumber } })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.campaignId !== session.user.campaignId && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (lead.status !== 'JOB_BOOKED') {
    return NextResponse.json({ error: 'Job report can only be uploaded when the job is booked.' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()
  const fileName = `job-reports/${lead.campaignId}/${quoteNumber}-report.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  let fileUrl: string
  try {
    fileUrl = await saveFile(buffer, fileName, file.type)
  } catch {
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        jobReportUrl: fileUrl,
        jobReportUploadedAt: new Date(),
        jobReportUploadedBy: session.user.id,
      },
    })
    await tx.attachment.create({
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        uploadedByUserId: session.user.id,
        fileName: file.name,
        fileType: file.type,
        fileUrl,
        fileSizeBytes: file.size,
        attachmentType: 'JOB_REPORT',
      },
    })
  })

  return NextResponse.json({ fileUrl, fileName: file.name })
}
