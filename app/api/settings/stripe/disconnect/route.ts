import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE() {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'CLIENT')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRole = session.user.role
  const campaignId = session.user.campaignId
  if (!campaignId) {
    return NextResponse.json({ error: 'No campaign assigned.' }, { status: 400 })
  }

  try {
    await prisma.billingProfile.delete({
      where: { campaign_id_role: { campaign_id: campaignId, role: userRole } },
    })
  } catch {
    // Record not found — already disconnected, treat as success
  }

  return NextResponse.json({ disconnected: true })
}
