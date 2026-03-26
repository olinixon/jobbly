import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import SettingsForm from '@/components/campaigns/SettingsForm'

export default async function SettingsPage() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const campaignId = session.user.campaignId
  if (!campaignId) {
    return (
      <AppShell>
        <PageHeader title="Settings" />
        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
          No campaign selected. <a href="/campaigns" className="text-[#2563EB] hover:underline">Choose a campaign</a>.
        </p>
      </AppShell>
    )
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) redirect('/campaigns')

  return (
    <AppShell>
      <PageHeader title="Campaign Settings" />
      <SettingsForm campaign={campaign} />
    </AppShell>
  )
}
