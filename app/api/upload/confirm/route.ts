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

  // Auto-advance to JOB_COMPLETED when SUBCONTRACTOR or ADMIN uploads an invoice on a JOB_BOOKED lead
  const shouldAutoComplete = (session.user.role === 'SUBCONTRACTOR' || session.user.role === 'ADMIN') && lead.status === 'JOB_BOOKED'

  const invoiceData = {
    invoiceUrl: fileUrl,
    invoiceUploadedAt: new Date(),
    invoiceUploadedById: session.user.id,
    contractorRate,
    customerPrice,
    grossMarkup,
    omnisideCommission,
    clientMargin,
    ...(shouldAutoComplete ? { status: 'JOB_COMPLETED' as const, jobCompletedAt: new Date() } : {}),
  }

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: lead.id }, data: invoiceData })
    await tx.attachment.create({
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
    })
    if (shouldAutoComplete) {
      await tx.auditLog.create({
        data: {
          leadId: lead.id,
          campaignId: lead.campaignId,
          changedByUserId: session.user.id,
          changedByName: session.user.name,
          oldStatus: 'JOB_BOOKED',
          newStatus: 'JOB_COMPLETED',
        },
      })
    }
  })

  // Fire job completed email to eligible admins (fire and forget)
  if (shouldAutoComplete || session.user.role === 'ADMIN') {
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
  }

  return NextResponse.json({
    success: true,
    autoCompleted: shouldAutoComplete,
    message: shouldAutoComplete
      ? 'Invoice uploaded and job marked as completed.'
      : 'Invoice uploaded successfully.',
  })
}
