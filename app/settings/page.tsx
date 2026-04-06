import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import SettingsForm from '@/components/campaigns/SettingsForm'
import CampaignDangerZone from '@/components/campaigns/CampaignDangerZone'
import StripeConnectionSetup from '@/components/settings/StripeConnectionSetup'
import InvoiceReminderSettings from '@/components/settings/InvoiceReminderSettings'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'

export default async function SettingsPage() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const campaignId = await getActiveCampaignId(session.user.campaignId, session.user.role)
  if (!campaignId) redirect('/campaigns')

  const [campaign, jobTypes, rawSlots, user, billingProfile] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.jobType.findMany({ where: { campaignId }, orderBy: { sortOrder: 'asc' } }),
    prisma.availabilitySlot.findMany({
      where: { campaignId },
      orderBy: { date: 'asc' },
      include: { bookings: { where: { status: 'CONFIRMED' }, select: { id: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { invoice_reminder_day: true },
    }),
    prisma.billingProfile.findUnique({
      where: { campaign_id_role: { campaign_id: campaignId, role: 'ADMIN' } },
      select: {
        company_name: true,
        billing_email: true,
        billing_address: true,
        stripe_verified: true,
        stripe_verified_at: true,
      },
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

  const profileSummary = billingProfile
    ? {
        company_name: billingProfile.company_name,
        billing_email: billingProfile.billing_email,
        billing_address: billingProfile.billing_address,
        stripe_verified: billingProfile.stripe_verified,
        stripe_verified_at: billingProfile.stripe_verified_at?.toISOString() ?? null,
      }
    : null

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle={campaign.name} />
      <SettingsForm campaign={campaign} jobTypes={jobTypes} availabilitySlots={availabilitySlots} />

      {/* Stripe & Invoicing */}
      <div className="max-w-3xl mx-auto mt-8">
        <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-1">Stripe & Invoicing</h2>
          <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mb-6">
            Connect your Stripe account to send invoices to {campaign.clientCompanyName} directly from Jobbly.
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1] mb-3">Stripe Connection</h3>
              <StripeConnectionSetup
                role="ADMIN"
                senderCompanyName={billingProfile?.company_name ?? 'Omniside AI'}
                recipientCompanyName={campaign.clientCompanyName}
                initialProfile={profileSummary}
              />
            </div>

            <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-6">
              <h3 className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1] mb-3">Invoice Reminder</h3>
              <InvoiceReminderSettings initialDay={user?.invoice_reminder_day ?? null} />
            </div>
          </div>
        </section>
      </div>

      {/* Danger Zone — always last */}
      <div className="max-w-3xl mx-auto mt-8">
        <CampaignDangerZone campaignId={campaignId} />
      </div>
    </AppShell>
  )
}
