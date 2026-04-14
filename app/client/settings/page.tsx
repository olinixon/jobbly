import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import CustomerPaymentPlatform from '@/components/settings/CustomerPaymentPlatform'

export default async function ClientSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; provider?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role !== 'CLIENT') redirect('/login')

  const campaignId = session.user.campaignId
  if (!campaignId) redirect('/dashboard')

  const sp = await searchParams

  const [campaign, customerPaymentProfile] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { clientCompanyName: true },
    }),
    prisma.customerPaymentProfile.findFirst({
      where: { user_id: session.user.id },
      select: {
        provider: true,
        verified: true,
        verified_at: true,
        myob_company_file_id: true,
        stripe_webhook_secret: true,
      },
    }),
  ])

  if (!campaign) redirect('/dashboard')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // CustomerPaymentProfile — never pass encrypted tokens to frontend
  const cppProvider = customerPaymentProfile?.provider ?? null
  const cppVerified = customerPaymentProfile?.verified ?? false
  const cppVerifiedAt = customerPaymentProfile?.verified_at?.toISOString() ?? null
  const myobFileId = customerPaymentProfile?.myob_company_file_id ?? null
  const myobFileIdMasked = myobFileId ? myobFileId.slice(-8) : null
  const hasCustomerWebhookSecret = !!customerPaymentProfile?.stripe_webhook_secret

  return (
    <AppShell>
      <PageHeader title="Settings" />

      <div className="space-y-8 max-w-3xl mx-auto">
        {/* Customer Payment Platform */}
        <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-1">Customer Payment Platform</h2>
          <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mb-6">
            Controls how Jobbly creates invoices and collects payment from homeowners after each completed gutter clean.
          </p>
          <CustomerPaymentPlatform
            provider={cppProvider}
            verified={cppVerified}
            verifiedAt={cppVerifiedAt}
            myobFileIdMasked={myobFileIdMasked}
            hasWebhookSecret={hasCustomerWebhookSecret}
            appUrl={appUrl}
            userEmail={session.user.email ?? ''}
            paymentParam={sp.payment ?? null}
            paymentProvider={sp.provider ?? null}
          />
        </section>

      </div>
    </AppShell>
  )
}
