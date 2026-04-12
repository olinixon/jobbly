import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updateData: Record<string, boolean> = {}

  if (session.user.role === 'SUBCONTRACTOR' && typeof body.notifyNewLead === 'boolean') {
    updateData.notifyNewLead = body.notifyNewLead
  }
  if (session.user.role === 'ADMIN' && typeof body.notifyJobCompleted === 'boolean') {
    updateData.notifyJobCompleted = body.notifyJobCompleted
  }
  if (session.user.role === 'ADMIN' && typeof body.notify_payment_reminder === 'boolean') {
    updateData.notify_payment_reminder = body.notify_payment_reminder
  }
  if (session.user.role === 'ADMIN' && typeof body.notify_payment_overdue === 'boolean') {
    updateData.notify_payment_overdue = body.notify_payment_overdue
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  await prisma.user.update({ where: { id: session.user.id }, data: updateData })
  return NextResponse.json({ success: true })
}
