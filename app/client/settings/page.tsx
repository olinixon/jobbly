import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import StripeConnectionSetup from '@/components/settings/StripeConnectionSetup'
import WebhookSetup from '@/components/settings/WebhookSetup'
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

  const [campaign, billingProfile, customerPaymentProfile] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { clientCompanyName: true, subcontractorCompanyName: true },
    }),
    prisma.billingProfile.findUnique({
      where: { campaign_id_role: { campaign_id: campaignId, role: 'CLIENT' } },
      select: {
        company_name: true,
        billing_email: true,
        billing_address: true,
        stripe_verified: true,
        stripe_verified_at: true,
        stripe_webhook_secret: true,
      },
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

  const profileSummary = billingProfile
    ? {
        company_name: billingProfile.company_name,
        billing_email: billingProfile.billing_email,
        billing_address: billingProfile.billing_address,
        stripe_verified: billingProfile.stripe_verified,
        stripe_verified_at: billingProfile.stripe_verified_at?.toISOString() ?? null,
      }
    : null

  const stripeVerified = billingProfile?.stripe_verified === true
  const hasWebhookSecret = !!billingProfile?.stripe_webhook_secret
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const webhookUrl = `${appUrl}/api/webhooks/stripe`

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
            paymentParam={sp.payment ?? null}
            paymentProvider={sp.provider ?? null}
          />
        </section>

        {/* Stripe — B2B Customer Payments (existing BillingProfile connection) */}
        <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-1">Stripe — B2B Invoicing</h2>
          <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mb-6">
            Connect your Stripe account for receiving batch invoices from Omniside. This is separate from the customer payment platform above.
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1] mb-3">Stripe Connection</h3>
              <StripeConnectionSetup
                role="CLIENT"
                mode="payment_only"
                senderCompanyName={campaign.clientCompanyName}
                recipientCompanyName={campaign.subcontractorCompanyName}
                initialProfile={profileSummary}
              />
            </div>

            <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-6">
              <h3 className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1] mb-3">Webhook Setup</h3>
              {stripeVerified ? (
                <WebhookSetup webhookUrl={webhookUrl} hasExistingSecret={hasWebhookSecret} />
              ) : (
                <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">
                  Complete your Stripe connection above before setting up webhooks.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
