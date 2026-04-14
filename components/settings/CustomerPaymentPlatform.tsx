'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface CustomerPaymentPlatformProps {
  provider: string | null      // 'STRIPE' | 'MYOB' | null
  verified: boolean
  verifiedAt: string | null    // ISO string
  myobFileIdMasked: string | null
  hasWebhookSecret: boolean
  appUrl: string
  userEmail: string
  // URL param signals from OAuth redirect
  paymentParam: string | null  // 'connected' | 'error' | null
  paymentProvider: string | null  // 'myob' | 'stripe' | null
}

export default function CustomerPaymentPlatform({
  provider,
  verified,
  verifiedAt,
  myobFileIdMasked,
  hasWebhookSecret,
  appUrl,
  userEmail,
  paymentParam,
  paymentProvider,
}: CustomerPaymentPlatformProps) {
  const router = useRouter()

  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Stripe verify
  const [stripeKey, setStripeKey] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [stripeGuideOpen, setStripeGuideOpen] = useState(false)

  // Stripe webhook
  const [webhookSecret, setWebhookSecret] = useState('')
  const [savingWebhook, setSavingWebhook] = useState(false)
  const [webhookSaved, setWebhookSaved] = useState(false)
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [webhookConfigured, setWebhookConfigured] = useState(hasWebhookSecret)
  const [webhookGuideOpen, setWebhookGuideOpen] = useState(false)

  // MYOB coming soon guide
  const [myobGuideOpen, setMyobGuideOpen] = useState(false)

  // Xero coming soon guide
  const [xeroGuideOpen, setXeroGuideOpen] = useState(false)

  // Disconnect
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Handle URL param banners
  useEffect(() => {
    if (paymentParam === 'connected' && paymentProvider === 'stripe') {
      setBanner({ type: 'success', message: 'Stripe connected successfully.' })
    } else if (paymentParam === 'error') {
      setBanner({ type: 'error', message: 'Connection failed. Please try again or contact support.' })
    }
    if (paymentParam) {
      const url = new URL(window.location.href)
      url.searchParams.delete('payment')
      url.searchParams.delete('provider')
      router.replace(url.pathname, { scroll: false })
    }
  }, [paymentParam, paymentProvider, router])

  const isStripeConnected = verified && provider === 'STRIPE'
  const isMYOBConnected = verified && provider === 'MYOB'

  async function handleStripeVerify() {
    setVerifying(true)
    setVerifyError(null)
    const res = await fetch('/api/customer-payment/stripe/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stripe_secret_key: stripeKey }),
    })
    const data = await res.json()
    setVerifying(false)
    if (res.ok && data.verified) {
      router.refresh()
    } else {
      setVerifyError(data.error ?? 'Verification failed. Check your key and try again.')
    }
  }

  async function handleSaveWebhook() {
    setSavingWebhook(true)
    setWebhookError(null)
    const res = await fetch('/api/customer-payment/stripe/save-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_secret: webhookSecret }),
    })
    const data = await res.json()
    setSavingWebhook(false)
    if (res.ok && data.saved) {
      setWebhookConfigured(true)
      setWebhookSaved(true)
      setWebhookSecret('')
    } else {
      setWebhookError(data.error ?? 'Failed to save webhook secret.')
    }
  }

  async function handleDisconnect(platform: 'MYOB' | 'STRIPE') {
    setDisconnecting(true)
    const endpoint = platform === 'MYOB'
      ? '/api/customer-payment/myob/disconnect'
      : '/api/customer-payment/stripe/disconnect'
    await fetch(endpoint, { method: 'POST' })
    setDisconnecting(false)
    setConfirmDisconnect(false)
    router.refresh()
  }

  const webhookUrl = `${appUrl}/api/webhooks/stripe`

  return (
    <div className="space-y-6">
      {banner && (
        <div className={`p-3 rounded-lg text-sm font-medium ${banner.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-[#DC2626] dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
          {banner.message}
        </div>
      )}

      {/* ── Platform selector cards ─────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        {/* Stripe — selected */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1e3a5f]/40 dark:border-[#3B82F6] min-w-36">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[#1D4ED8] dark:text-[#3B82F6]">Stripe</span>
            <span className="text-xs text-[#2563EB] dark:text-[#60A5FA]">
              {isStripeConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <div className="ml-auto">
            <div className="w-4 h-4 rounded-full border-2 border-[#2563EB] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
            </div>
          </div>
        </div>

        {/* MYOB — coming soon */}
        <div className="relative flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A] min-w-36 opacity-60 cursor-not-allowed select-none">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1]">MYOB</span>
            <span className="text-xs text-[#9CA3AF] dark:text-[#475569]">Coming soon</span>
          </div>
        </div>

        {/* Xero — coming soon */}
        <div className="relative flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A] min-w-36 opacity-60 cursor-not-allowed select-none">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1]">Xero</span>
            <span className="text-xs text-[#9CA3AF] dark:text-[#475569]">Coming soon</span>
          </div>
        </div>
      </div>

      {/* ── MYOB connected (legacy — existing users only) ───────────────────── */}
      {isMYOBConnected && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">MYOB Business — Connected</span>
              </div>
              {myobFileIdMasked && (
                <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Company file: ...{myobFileIdMasked}</p>
              )}
              {verifiedAt && (
                <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                  Connected {new Date(verifiedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="px-4 py-2 text-sm font-medium border border-[#DC2626] rounded-lg text-[#DC2626] hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
          >
            Disconnect MYOB
          </button>

          {confirmDisconnect && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
              <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
                Disconnecting MYOB will remove the payment link from all future customer invoices until a new platform is connected. Are you sure?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleDisconnect('MYOB')}
                  disabled={disconnecting}
                  className="px-4 py-2 text-sm font-medium bg-[#DC2626] text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {disconnecting ? 'Disconnecting…' : 'Yes, Disconnect'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(false)}
                  className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Stripe connection ───────────────────────────────────────────────── */}
      {!isMYOBConnected && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1]">Stripe Connection</h3>

          {isStripeConnected ? (
            /* Connected state */
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                    <span className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">Connected</span>
                    <span className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{userEmail}</span>
                  </div>
                  {verifiedAt && (
                    <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                      Verified {new Date(verifiedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>

              {/* Webhook section — shown when connected */}
              {!webhookConfigured && (
                <div className="space-y-3">
                  <p className="text-sm text-amber-600 dark:text-amber-400">Webhook not configured — payment confirmations will not be received until you add your webhook signing secret.</p>

                  <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setWebhookGuideOpen((o) => !o)}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
                    >
                      <span>How to set this up — takes 2 minutes</span>
                      <span className="text-[#9CA3AF]">{webhookGuideOpen ? '▲' : '▼'}</span>
                    </button>
                    {webhookGuideOpen && (
                      <div className="px-4 pb-4 border-t border-[#F3F4F6] dark:border-[#334155] pt-3 space-y-2 text-sm text-[#6B7280] dark:text-[#94A3B8]">
                        <p>1. In Stripe, go to Developers → Webhooks</p>
                        <p>2. Click "Add endpoint"</p>
                        <p>3. Enter this URL: <code className="bg-[#F3F4F6] dark:bg-[#0F172A] px-1 rounded text-xs">{webhookUrl}</code></p>
                        <p>4. Select the event: checkout.session.completed</p>
                        <p>5. Copy the Signing Secret (starts with whsec_...)</p>
                        <p>6. Paste it below and click Save</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">
                      Webhook Signing Secret (whsec_...)
                    </label>
                    <input
                      type="password"
                      value={webhookSecret}
                      onChange={(e) => { setWebhookSecret(e.target.value); setWebhookError(null) }}
                      placeholder="whsec_..."
                      className="w-full px-3 py-2 text-sm border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveWebhook}
                    disabled={savingWebhook || !webhookSecret.trim()}
                    className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] disabled:opacity-50 transition-colors"
                  >
                    {savingWebhook ? 'Saving…' : 'Save Webhook Secret'}
                  </button>
                  {webhookSaved && <p className="text-sm text-green-600 dark:text-green-400">Saved</p>}
                  {webhookError && <p className="text-sm text-[#DC2626]">{webhookError}</p>}
                </div>
              )}

              {webhookConfigured && (
                <p className="text-sm text-green-600 dark:text-green-400">Webhook configured</p>
              )}

              <button
                type="button"
                onClick={() => setConfirmDisconnect(true)}
                className="px-4 py-2 text-sm font-medium border border-[#DC2626] rounded-lg text-[#DC2626] hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
              >
                Disconnect Stripe
              </button>

              {confirmDisconnect && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
                    Disconnecting Stripe will remove the payment link from all future customer invoices until a new platform is connected. Are you sure?
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleDisconnect('STRIPE')}
                      disabled={disconnecting}
                      className="px-4 py-2 text-sm font-medium bg-[#DC2626] text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {disconnecting ? 'Disconnecting…' : 'Yes, Disconnect'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(false)}
                      className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Not connected state */
            <div className="space-y-4">
              <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setStripeGuideOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
                >
                  <span>How to set this up</span>
                  <span className="text-[#9CA3AF]">{stripeGuideOpen ? '▲' : '▼'}</span>
                </button>
                {stripeGuideOpen && (
                  <div className="px-4 pb-4 border-t border-[#F3F4F6] dark:border-[#334155] pt-3 space-y-2 text-sm text-[#6B7280] dark:text-[#94A3B8]">
                    <p>1. Log in to your Stripe account at stripe.com</p>
                    <p>2. Go to Developers → API Keys</p>
                    <p>3. Copy your Secret Key (starts with sk_live_...)</p>
                    <p>4. Paste it in the field below and click Connect</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">
                  Secret Key (sk_live_...)
                </label>
                <input
                  type="password"
                  value={stripeKey}
                  onChange={(e) => { setStripeKey(e.target.value); setVerifyError(null) }}
                  placeholder="sk_live_..."
                  className="w-full px-3 py-2 text-sm border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              <button
                type="button"
                onClick={handleStripeVerify}
                disabled={verifying || !stripeKey.trim()}
                className="px-5 py-2.5 bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] text-sm font-semibold rounded-lg hover:bg-[#374151] dark:hover:bg-[#CBD5E1] disabled:opacity-50 transition-colors"
              >
                {verifying ? 'Verifying…' : 'Connect Stripe'}
              </button>
              {verifyError && <p className="text-sm text-[#DC2626]">{verifyError}</p>}

              {/* Webhook section */}
              <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-4 space-y-3">
                <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">Webhook Signing Secret</p>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  So Jobbly can confirm when customers have paid, register the Jobbly webhook URL in Stripe and paste the signing secret here.
                </p>

                <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setWebhookGuideOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
                  >
                    <span>How to set this up — takes 2 minutes</span>
                    <span className="text-[#9CA3AF]">{webhookGuideOpen ? '▲' : '▼'}</span>
                  </button>
                  {webhookGuideOpen && (
                    <div className="px-4 pb-4 border-t border-[#F3F4F6] dark:border-[#334155] pt-3 space-y-2 text-sm text-[#6B7280] dark:text-[#94A3B8]">
                      <p>1. In Stripe, go to Developers → Webhooks</p>
                      <p>2. Click "Add endpoint"</p>
                      <p>3. Enter this URL: <code className="bg-[#F3F4F6] dark:bg-[#0F172A] px-1 rounded text-xs">{webhookUrl}</code></p>
                      <p>4. Select the event: checkout.session.completed</p>
                      <p>5. Copy the Signing Secret (starts with whsec_...)</p>
                      <p>6. Paste it below and click Save</p>
                    </div>
                  )}
                </div>

                <div>
                  <input
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => { setWebhookSecret(e.target.value); setWebhookError(null) }}
                    placeholder="whsec_..."
                    className="w-full px-3 py-2 text-sm border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveWebhook}
                  disabled={savingWebhook || !webhookSecret.trim()}
                  className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] disabled:opacity-50 transition-colors"
                >
                  {savingWebhook ? 'Saving…' : 'Save Webhook Secret'}
                </button>
                {webhookSaved && <p className="text-sm text-green-600 dark:text-green-400">Saved</p>}
                {webhookError && <p className="text-sm text-[#DC2626]">{webhookError}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MYOB — coming soon ──────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1]">
          MYOB Business <span className="ml-1 text-xs font-normal text-[#9CA3AF] dark:text-[#475569]">— Coming soon</span>
        </h3>
        <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setMyobGuideOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
          >
            <span>How to set this up</span>
            <span className="text-[#9CA3AF]">{myobGuideOpen ? '▲' : '▼'}</span>
          </button>
          {myobGuideOpen && (
            <div className="px-4 pb-4 border-t border-[#F3F4F6] dark:border-[#334155] pt-3 space-y-2 text-sm text-[#6B7280] dark:text-[#94A3B8]">
              <p>When MYOB is available, you will need:</p>
              <ul className="ml-4 space-y-1 list-disc">
                <li>Your MYOB API Client ID and Client Secret (found in my.myob.com → Developer → Apps)</li>
                <li>Access to your MYOB company file</li>
              </ul>
              <p>Jobbly will guide you through the connection process when MYOB support launches.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Xero — coming soon ──────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1]">
          Xero <span className="ml-1 text-xs font-normal text-[#9CA3AF] dark:text-[#475569]">— Coming soon</span>
        </h3>
        <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setXeroGuideOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
          >
            <span>How to set this up</span>
            <span className="text-[#9CA3AF]">{xeroGuideOpen ? '▲' : '▼'}</span>
          </button>
          {xeroGuideOpen && (
            <div className="px-4 pb-4 border-t border-[#F3F4F6] dark:border-[#334155] pt-3 space-y-2 text-sm text-[#6B7280] dark:text-[#94A3B8]">
              <p>When Xero is available, you will need:</p>
              <ul className="ml-4 space-y-1 list-disc">
                <li>A Xero account with invoicing enabled</li>
                <li>To authorise Jobbly via Xero's OAuth connection (no manual API keys required — Jobbly will redirect you to Xero to approve access)</li>
              </ul>
              <p>Jobbly will guide you through the connection process when Xero support launches.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
