'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface CustomerPaymentPlatformProps {
  provider: string | null      // 'STRIPE' | 'MYOB' | null
  verified: boolean
  verifiedAt: string | null    // ISO string
  myobFileIdMasked: string | null  // last 8 chars of myob_company_file_id
  hasWebhookSecret: boolean
  appUrl: string
  // URL param signals from MYOB OAuth redirect
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
  paymentParam,
  paymentProvider,
}: CustomerPaymentPlatformProps) {
  const router = useRouter()

  // Banner state (from URL params)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // State A — platform selector
  const [selectedPlatform, setSelectedPlatform] = useState<'MYOB' | 'STRIPE'>('MYOB')
  const [guideOpen, setGuideOpen] = useState(false)

  // Stripe verify
  const [stripeKey, setStripeKey] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  // Stripe webhook
  const [webhookSecret, setWebhookSecret] = useState('')
  const [savingWebhook, setSavingWebhook] = useState(false)
  const [webhookSaved, setWebhookSaved] = useState(false)
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [webhookConfigured, setWebhookConfigured] = useState(hasWebhookSecret)

  // Test connection
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Disconnect
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Switch platform
  const [confirmSwitch, setConfirmSwitch] = useState(false)
  const [showStripeEntryForSwitch, setShowStripeEntryForSwitch] = useState(false)

  // Reload trigger
  const [reloadKey, setReloadKey] = useState(0)

  // Handle URL param banners
  useEffect(() => {
    if (paymentParam === 'connected' && paymentProvider === 'myob') {
      setBanner({ type: 'success', message: 'MYOB connected successfully.' })
    } else if (paymentParam === 'connected' && paymentProvider === 'stripe') {
      setBanner({ type: 'success', message: 'Stripe connected successfully.' })
    } else if (paymentParam === 'error') {
      setBanner({ type: 'error', message: 'Connection failed. Please try again or contact Oli.' })
    }
    // Remove query params from URL after displaying
    if (paymentParam) {
      const url = new URL(window.location.href)
      url.searchParams.delete('payment')
      url.searchParams.delete('provider')
      router.replace(url.pathname, { scroll: false })
    }
  }, [paymentParam, paymentProvider, router])

  const isConnected = verified && (provider === 'MYOB' || provider === 'STRIPE')
  const isMYOBConnected = isConnected && provider === 'MYOB'
  const isStripeConnected = isConnected && provider === 'STRIPE'

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

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/api/customer-payment/myob/test-connection', { method: 'POST' })
    const data = await res.json()
    setTesting(false)
    if (res.ok && data.status === 'connected') {
      setTestResult({ ok: true, message: `Connected — ${data.company_name}` })
    } else {
      setTestResult({ ok: false, message: data.message ?? 'Connection failed. Try reconnecting.' })
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

  // ─── STATE A — no active platform ────────────────────────────────────────────
  if (!isConnected && !showStripeEntryForSwitch) {
    return (
      <div className="space-y-5">
        {banner && (
          <div className={`p-3 rounded-lg text-sm font-medium ${banner.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-[#DC2626] dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
            {banner.message}
          </div>
        )}

        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
          This controls how Jobbly collects payment from homeowners after each completed gutter clean.
          Only one platform can be active at a time.
        </p>

        <div>
          <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-3">
            Which platform does your business use?
          </p>
          <div className="space-y-2">
            {(['MYOB', 'STRIPE'] as const).map((p) => (
              <label key={p} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="payment-platform"
                  value={p}
                  checked={selectedPlatform === p}
                  onChange={() => { setSelectedPlatform(p); setGuideOpen(false) }}
                  className="w-4 h-4 text-[#2563EB]"
                />
                <span className="text-sm text-[#374151] dark:text-[#CBD5E1]">
                  {p === 'MYOB' ? 'MYOB Business' : 'Stripe'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Collapsible guide */}
        <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setGuideOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
          >
            <span>How to set this up</span>
            <span className="text-[#9CA3AF]">{guideOpen ? '▲' : '▼'}</span>
          </button>

          {guideOpen && selectedPlatform === 'MYOB' && (
            <div className="px-4 pb-5 border-t border-[#F3F4F6] dark:border-[#334155] pt-4 space-y-4 text-sm text-[#6B7280] dark:text-[#94A3B8]">
              <p>
                <strong className="text-[#374151] dark:text-[#CBD5E1]">Step 1</strong> — Log in to MYOB Business at myob.com
              </p>
              <div>
                <p className="mb-1"><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 2</strong> — Enable Online Invoice Payments</p>
                <p className="ml-4 text-xs">Settings → Sales Settings → Payments tab<br />
                  Click "Set up online invoice payments" and follow the prompts<br />
                  This adds a Pay Now button to invoices for card payments (2.7% + $0.25 fee)
                </p>
              </div>
              <div>
                <p className="mb-1"><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 3</strong> — Enable surcharging (recommended)</p>
                <p className="ml-4 text-xs">Same Payments tab → select "Your customers pay the surcharge"<br />
                  The card fee is added to the invoice total — bank transfer stays free
                </p>
              </div>
              <div>
                <p className="mb-1"><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 4</strong> — Add your bank account for direct deposit</p>
                <p className="ml-4 text-xs">Same Payments tab → "Allow payments by direct deposit"<br />
                  Enter your bank account name and number<br />
                  This appears on every invoice so customers can bank transfer for free
                </p>
              </div>
              <p>
                <strong className="text-[#374151] dark:text-[#CBD5E1]">Step 5</strong> — Come back here and click Connect MYOB. You will approve access in MYOB — takes about 30 seconds.
              </p>
              <a
                href="/api/customer-payment/myob/connect"
                className="inline-block mt-2 px-5 py-2.5 bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] text-sm font-semibold rounded-lg hover:bg-[#374151] dark:hover:bg-[#CBD5E1] transition-colors"
              >
                Connect MYOB
              </a>
            </div>
          )}

          {guideOpen && selectedPlatform === 'STRIPE' && (
            <div className="px-4 pb-5 border-t border-[#F3F4F6] dark:border-[#334155] pt-4 space-y-4 text-sm text-[#6B7280] dark:text-[#94A3B8]">
              <p>
                <strong className="text-[#374151] dark:text-[#CBD5E1]">Step 1</strong> — Log in to Stripe at stripe.com. Ensure your account is in New Zealand and set to NZD.
              </p>
              <div>
                <p className="mb-1"><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 2</strong> — Get your Secret Key</p>
                <p className="ml-4 text-xs">Stripe Dashboard → Developers → API keys<br />
                  Copy your Secret key (starts with sk_live_...)<br />
                  Use your live key, not the test key
                </p>
              </div>
              <div>
                <p className="mb-1"><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 3</strong> — Set up your Webhook</p>
                <p className="ml-4 text-xs">Stripe Dashboard → Developers → Webhooks → Add endpoint<br />
                  Endpoint URL: <code className="bg-[#F3F4F6] dark:bg-[#0F172A] px-1 rounded">{appUrl}/api/webhooks/stripe</code><br />
                  Select event: checkout.session.completed<br />
                  Copy the Signing Secret (starts with whsec_...)
                </p>
              </div>
              <p>
                <strong className="text-[#374151] dark:text-[#CBD5E1]">Step 4</strong> — Paste your credentials below
              </p>

              <div className="space-y-3 mt-1">
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
                  {verifying ? 'Verifying…' : 'Verify & Connect'}
                </button>
                {verifyError && (
                  <p className="text-sm text-[#DC2626]">{verifyError}</p>
                )}
              </div>

              {/* Webhook secret — shown after connect */}
              <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-4 space-y-3">
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">After connecting, add your Webhook Signing Secret:</p>
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
                {webhookSaved && <p className="text-sm text-green-600 dark:text-green-400">Saved ✓</p>}
                {webhookError && <p className="text-sm text-[#DC2626]">{webhookError}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── STATE B — MYOB connected ─────────────────────────────────────────────────
  if (isMYOBConnected) {
    return (
      <div className="space-y-5">
        {banner && (
          <div className={`p-3 rounded-lg text-sm font-medium ${banner.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-[#DC2626] dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
            {banner.message}
          </div>
        )}

        <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl">
          <span className="text-xl">✅</span>
          <div className="space-y-1">
            <p className="font-semibold text-[#111827] dark:text-[#F1F5F9]">MYOB Business — Connected</p>
            {myobFileIdMasked && (
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">Company file: ...{myobFileIdMasked}</p>
            )}
            {verifiedAt && (
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                Connected: {new Date(verifiedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mt-2">
              Jobbly will automatically create a MYOB invoice for each completed job.
              Homeowners can pay by card (2.7% surcharge) or bank transfer (free).
              Payment status is checked and updated daily.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] disabled:opacity-60 transition-colors"
          >
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="px-4 py-2 text-sm font-medium border border-[#DC2626] rounded-lg text-[#DC2626] hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
          >
            Disconnect MYOB
          </button>
        </div>

        {testResult && (
          <p className={`text-sm ${testResult.ok ? 'text-green-600 dark:text-green-400' : 'text-[#DC2626]'}`}>
            {testResult.ok ? '✅' : '❌'} {testResult.message}
          </p>
        )}

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

        <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-4">
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-3">Want to switch to Stripe instead?</p>
          {!confirmSwitch ? (
            <button
              type="button"
              onClick={() => setConfirmSwitch(true)}
              className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
            >
              Switch to Stripe
            </button>
          ) : (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
              <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
                This will disconnect your MYOB connection and replace it with Stripe. Future customer invoices will use Stripe instead. Continue?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setConfirmSwitch(false); setShowStripeEntryForSwitch(true) }}
                  className="px-4 py-2 text-sm font-medium bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] rounded-lg hover:bg-[#374151] dark:hover:bg-[#CBD5E1] transition-colors"
                >
                  Yes, Switch to Stripe
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSwitch(false)}
                  className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── STATE C — Stripe connected ───────────────────────────────────────────────
  if (isStripeConnected) {
    return (
      <div className="space-y-5">
        {banner && (
          <div className={`p-3 rounded-lg text-sm font-medium ${banner.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-[#DC2626] dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
            {banner.message}
          </div>
        )}

        <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl">
          <span className="text-xl">✅</span>
          <div className="space-y-1">
            <p className="font-semibold text-[#111827] dark:text-[#F1F5F9]">Stripe — Connected</p>
            {verifiedAt && (
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                Connected: {new Date(verifiedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>

        {/* Webhook status */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">Webhook</p>
          {webhookConfigured ? (
            <p className="text-sm text-green-600 dark:text-green-400">✅ Configured</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-amber-600 dark:text-amber-400">⚠️ Not configured — paste your webhook signing secret below</p>
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
                className="px-4 py-2 text-sm font-medium bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] rounded-lg hover:bg-[#374151] dark:hover:bg-[#CBD5E1] disabled:opacity-50 transition-colors"
              >
                {savingWebhook ? 'Saving…' : 'Save Webhook Secret'}
              </button>
              {webhookSaved && <p className="text-sm text-green-600 dark:text-green-400">Saved ✓</p>}
              {webhookError && <p className="text-sm text-[#DC2626]">{webhookError}</p>}
            </div>
          )}
        </div>

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

        <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-4">
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-3">Want to switch to MYOB instead?</p>
          {!confirmSwitch ? (
            <button
              type="button"
              onClick={() => setConfirmSwitch(true)}
              className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
            >
              Switch to MYOB
            </button>
          ) : (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
              <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
                This will disconnect your Stripe connection and replace it with MYOB. Future customer invoices will use MYOB instead. Continue?
              </p>
              <div className="flex gap-3">
                <a
                  href="/api/customer-payment/myob/connect"
                  className="px-4 py-2 text-sm font-medium bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] rounded-lg hover:bg-[#374151] dark:hover:bg-[#CBD5E1] transition-colors"
                >
                  Yes, Switch to MYOB
                </a>
                <button
                  type="button"
                  onClick={() => setConfirmSwitch(false)}
                  className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Stripe entry shown when switching from MYOB → Stripe ─────────────────────
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
        Paste your Stripe Secret Key below to connect Stripe. This will also disconnect MYOB.
      </p>
      <div>
        <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">
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
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleStripeVerify}
          disabled={verifying || !stripeKey.trim()}
          className="px-5 py-2.5 bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] text-sm font-semibold rounded-lg hover:bg-[#374151] dark:hover:bg-[#CBD5E1] disabled:opacity-50 transition-colors"
        >
          {verifying ? 'Verifying…' : 'Verify & Connect'}
        </button>
        <button
          type="button"
          onClick={() => setShowStripeEntryForSwitch(false)}
          className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
        >
          Cancel
        </button>
      </div>
      {verifyError && <p className="text-sm text-[#DC2626]">{verifyError}</p>}
    </div>
  )
}
