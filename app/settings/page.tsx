import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import SettingsForm from '@/components/campaigns/SettingsForm'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'

export default async function SettingsPage() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const campaignId = await getActiveCampaignId(session.user.campaignId, session.user.role)
  if (!campaignId) redirect('/campaigns')

  const [campaign, jobTypes, rawSlots] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.jobType.findMany({ where: { campaignId }, orderBy: { sortOrder: 'asc' } }),
    prisma.availabilitySlot.findMany({
      where: { campaignId },
      orderBy: { date: 'asc' },
      include: { bookings: { where: { status: 'CONFIRMED' }, select: { id: true } } },
    }),
  ])
  if (!campaign) redirect('/campaigns')

  const availabilitySlots = rawSlots.map(s => ({
    id: s.id,
    date: s.date.toISOString(),
    startTime: s.startTime,
    endTime: s.endTime,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    confirmedBookings: s.bookings.length,
  }))

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle={campaign.name} />
      <SettingsForm campaign={campaign} jobTypes={jobTypes} availabilitySlots={availabilitySlots} />
    </AppShell>
  )
}
