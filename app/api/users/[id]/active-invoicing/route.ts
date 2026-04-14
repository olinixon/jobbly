import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: userId } = await params
  const body = await request.json()
  const { active } = body as { active: boolean }

  if (typeof active !== 'boolean') {
    return NextResponse.json({ success: false, error: 'active must be a boolean' }, { status: 400 })
  }

  // Fetch the user to confirm they exist and are CLIENT role
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, campaignId: true, customer_payment_profile: { select: { id: true } } },
  })

  if (!targetUser) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }
  if (targetUser.role !== 'CLIENT') {
    return NextResponse.json({ success: false, error: 'Only CLIENT users have an invoicing profile' }, { status: 400 })
  }
  if (!targetUser.customer_payment_profile) {
    return NextResponse.json({ success: false, error: 'This user has not connected a payment platform yet' }, { status: 400 })
  }

  const profileId = targetUser.customer_payment_profile.id
  const campaignId = targetUser.campaignId

  if (active) {
    // Deactivate all other profiles for the same campaign, then activate this one
    await prisma.$transaction([
      prisma.customerPaymentProfile.updateMany({
        where: { campaign_id: campaignId ?? undefined, is_active: true, id: { not: profileId } },
        data: { is_active: false },
      }),
      prisma.customerPaymentProfile.update({
        where: { id: profileId },
        data: { is_active: true },
      }),
    ])
    return NextResponse.json({ success: true })
  } else {
    // Deactivate this profile
    await prisma.customerPaymentProfile.update({
      where: { id: profileId },
      data: { is_active: false },
    })

    // Warn if no active profile remains for the campaign
    const remaining = await prisma.customerPaymentProfile.findFirst({
      where: { campaign_id: campaignId ?? undefined, is_active: true },
    })

    if (!remaining) {
      return NextResponse.json({
        success: true,
        warning: 'No active invoicing account remains for this campaign. Payments will not be processed until one is set.',
      })
    }

    return NextResponse.json({ success: true })
  }
}
