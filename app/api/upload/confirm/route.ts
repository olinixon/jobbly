import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { sendJobCompletedEmail } from '@/lib/notifications'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    quoteNumber,
    fileUrl,
    fileName,
    fileType,
    fileSizeBytes,
    customerPrice,
    contractorRate,
    grossMarkup,
    omnisideCommission,
    clientMargin,
  } = body

  if (!quoteNumber || !fileUrl || customerPrice == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({
    where: { quoteNumber },
    include: { campaign: true },
  })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        invoiceUrl: fileUrl,
        invoiceUploadedAt: new Date(),
        invoiceUploadedById: session.user.id,
        contractorRate,
        customerPrice,
        grossMarkup,
        omnisideCommission,
        clientMargin,
      },
    }),
    prisma.attachment.create({
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        uploadedByUserId: session.user.id,
        fileName: fileName ?? 'invoice',
        fileType: fileType ?? 'application/octet-stream',
        fileUrl,
        fileSizeBytes: fileSizeBytes ?? 0,
        attachmentType: 'INVOICE',
      },
    }),
  ])

  // Fire job completed email to eligible admins (fire and forget)
  ;(async () => {
    try {
      const admins = await prisma.user.findMany({
        where: { campaignId: lead.campaignId, role: 'ADMIN', isActive: true, notifyJobCompleted: true },
        select: { email: true },
      })
      if (admins.length > 0) {
        await sendJobCompletedEmail({
          to: admins.map(a => a.email),
          quoteNumber: lead.quoteNumber,
          customerName: lead.customerName,
          propertyAddress: lead.propertyAddress,
          contractorRate,
          customerPrice,
          omnisideCommission,
        })
      }
    } catch (err) {
      console.error('Job completed email failed:', err)
    }
  })()

  return NextResponse.json({ success: true })
}
