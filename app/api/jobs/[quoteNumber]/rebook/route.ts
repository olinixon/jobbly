import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session || !['ADMIN', 'SUBCONTRACTOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { quoteNumber } = await params
  const lead = await prisma.lead.findUnique({ where: { quoteNumber } })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (lead.campaignId !== session.user.campaignId && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (lead.status !== 'JOB_BOOKED') {
    return NextResponse.json({ error: 'This lead is not in the correct status to rebook.' }, { status: 400 })
  }

  const body = await request.json()
  const { job_booked_date } = body as { job_booked_date?: string }
  if (!job_booked_date) {
    return NextResponse.json({ error: 'Please select a new booking date.' }, { status: 400 })
  }
  const parsedDate = new Date(job_booked_date)
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format.' }, { status: 400 })
  }

  const updatedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: { jobBookedDate: parsedDate },
  })

  // Audit log — use a synthetic status transition for record-keeping
  await prisma.auditLog.create({
    data: {
      leadId: lead.id,
      campaignId: lead.campaignId,
      changedByUserId: session.user.id,
      changedByName: session.user.name ?? session.user.role,
      oldStatus: 'JOB_BOOKED',
      newStatus: 'JOB_BOOKED',
    },
  })

  return NextResponse.json(updatedLead)
}
