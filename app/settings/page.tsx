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

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) redirect('/campaigns')

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle={campaign.name} />
      <SettingsForm campaign={campaign} />
    </AppShell>
  )
}
