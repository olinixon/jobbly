import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import NewCampaignForm from '@/components/campaigns/NewCampaignForm'

export default async function NewCampaignPage() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  return (
    <AppShell>
      <PageHeader title="New Campaign" />
      <NewCampaignForm />
    </AppShell>
  )
}
