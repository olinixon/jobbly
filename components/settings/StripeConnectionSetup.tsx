'use client'

import { useState } from 'react'

export type BillingProfileSummary = {
  company_name: string
  billing_email: string
  billing_address: string | null
  stripe_verified: boolean
  stripe_verified_at: Date | string | null
}

interface Props {
  role: 'ADMIN' | 'CLIENT'
  senderCompanyName: string
  recipientCompanyName: string
  initialProfile: BillingProfileSummary | null
}

const STEPS = [
  { title: 'Create or log in to your Stripe account' },
  { title: 'Enable Invoicing in Stripe' },
  { title: 'Create a 15% GST Tax Rate' },
  { title: 'Create a Customer for your recipient' },
  { title: 'Connect Stripe to Jobbly' },
  { title: 'Set your invoice reminder day' },
]

function formatVerifiedDate(d: Date | string | null): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function StripeConnectionSetup({ role, senderCompanyName, recipientCompanyName, initialProfile }: Props) {
  const [profile, setProfile] = useState<BillingProfileSummary | null>(
    initialProfile?.stripe_verified ? initialProfile : null
  )
  const [expanded, setExpanded] = useState<number | null>(0)
  const [completed, setCompleted] = useState<Set<number>>(new Set())

  const [form, setForm] = useState({
    stripe_secret_key: '',
    stripe_gst_rate_id: '',
    stripe_customer_id: '',
    company_name: initialProfile?.company_name ?? senderCompanyName,
    billing_email: initialProfile?.billing_email ?? '',
    billing_address: initialProfile?.billing_address ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  function toggleStep(idx: number) {
    setExpanded(prev => (prev === idx ? null : idx))
  }

  function markComplete(idx: number) {
    setCompleted(prev => new Set([...prev, idx]))
    setExpanded(idx + 1 < STEPS.length ? idx + 1 : null)
  }

  async function handleVerify() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/stripe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Verification failed. Please try again.')
        return
      }
      setProfile({
        company_name: form.company_name,
        billing_email: form.billing_email,
        billing_address: form.billing_address || null,
        stripe_verified: true,
        stripe_verified_at: new Date(),
      })
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await fetch('/api/settings/stripe/disconnect', { method: 'DELETE' })
      setProfile(null)
      setForm({
        stripe_secret_key: '',
        stripe_gst_rate_id: '',
        stripe_customer_id: '',
        company_name: senderCompanyName,
        billing_email: '',
        billing_address: '',
      })
      setCompleted(new Set())
      setExpanded(0)
    } finally {
      setDisconnecting(false)
      setShowDisconnectConfirm(false)
    }
  }

  // Connected state
  if (profile?.stripe_verified) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            ● Connected
          </span>
          <span className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{profile.company_name}</span>
        </div>
        {profile.stripe_verified_at && (
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mb-4">
            Verified {formatVerifiedDate(profile.stripe_verified_at)}
          </p>
        )}
        {!showDisconnectConfirm ? (
          <button
            onClick={() => setShowDisconnectConfirm(true)}
            className="px-3 py-1.5 text-sm font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg text-[#374151] dark:text-[#CBD5E1] hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:border-red-700 dark:hover:text-red-400 transition-colors"
          >
            Disconnect Stripe
          </button>
        ) : (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
            <p className="text-sm text-red-700 dark:text-red-400 mb-3">
              This will disable invoice sending until you reconnect. Are you sure?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="px-3 py-1.5 text-sm font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Not connected state — 6-step checklist
  return (
    <div className="space-y-2">
      {STEPS.map((step, idx) => {
        const isExpanded = expanded === idx
        const isDone = completed.has(idx)

        return (
          <div
            key={idx}
            className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg overflow-hidden"
          >
            <button
              onClick={() => toggleStep(idx)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left bg-white dark:bg-[#1E293B] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
            >
              <span className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                isDone
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'border-[#D1D5DB] dark:border-[#4B5563] text-[#9CA3AF]'
              }`}>
                {isDone ? '✓' : idx + 1}
              </span>
              <span className={`flex-1 text-sm font-medium ${isDone ? 'text-[#6B7280] dark:text-[#94A3B8] line-through' : 'text-[#111827] dark:text-[#F1F5F9]'}`}>
                {step.title}
              </span>
              <span className="text-[#9CA3AF] text-xs">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 pt-1 bg-white dark:bg-[#1E293B] border-t border-[#F3F4F6] dark:border-[#334155]">
                {idx === 0 && (
                  <div className="space-y-2 text-sm text-[#374151] dark:text-[#CBD5E1]">
                    <p>Go to <strong>stripe.com</strong> and create an account, or log in if you already have one.</p>
                    <p>Make sure the account is registered under <strong>{senderCompanyName}</strong> — this is the name that will appear on invoices.</p>
                    <p>Ensure your account is in <strong>New Zealand</strong> and set to <strong>NZD</strong>.</p>
                    <button onClick={() => markComplete(idx)} className="mt-2 text-xs font-medium text-[#2563EB] dark:text-[#3B82F6] hover:underline">Mark complete →</button>
                  </div>
                )}
                {idx === 1 && (
                  <div className="space-y-2 text-sm text-[#374151] dark:text-[#CBD5E1]">
                    <p>In your Stripe dashboard, go to <strong>Settings → Billing → Invoice settings</strong>.</p>
                    <p>Set your default payment terms (e.g. "Due in 14 days").</p>
                    <p>Add your business details: company name, address, email, logo (optional).</p>
                    <button onClick={() => markComplete(idx)} className="mt-2 text-xs font-medium text-[#2563EB] dark:text-[#3B82F6] hover:underline">Mark complete →</button>
                  </div>
                )}
                {idx === 2 && (
                  <div className="space-y-2 text-sm text-[#374151] dark:text-[#CBD5E1]">
                    <p>In Stripe, go to <strong>Settings → Business tax details</strong>.</p>
                    <p>Display name: <strong>GST</strong>, Percentage: <strong>15</strong>, Inclusive: <strong>No</strong>.</p>
                    <p>Save and copy the <strong>Tax Rate ID</strong> (starts with <code className="bg-[#F3F4F6] dark:bg-[#0F172A] px-1 rounded">txr_...</code>).</p>
                    <button onClick={() => markComplete(idx)} className="mt-2 text-xs font-medium text-[#2563EB] dark:text-[#3B82F6] hover:underline">Mark complete →</button>
                  </div>
                )}
                {idx === 3 && (
                  <div className="space-y-2 text-sm text-[#374151] dark:text-[#CBD5E1]">
                    <p>In Stripe, go to <strong>Customers → Add customer</strong>.</p>
                    <p>Name: <strong>{recipientCompanyName}</strong>. Add their billing address, then save.</p>
                    <p>Copy the <strong>Customer ID</strong> (starts with <code className="bg-[#F3F4F6] dark:bg-[#0F172A] px-1 rounded">cus_...</code>).</p>
                    <button onClick={() => markComplete(idx)} className="mt-2 text-xs font-medium text-[#2563EB] dark:text-[#3B82F6] hover:underline">Mark complete →</button>
                  </div>
                )}
                {idx === 4 && (
                  <div className="space-y-3">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">Stripe Secret Key</label>
                        <input
                          type="password"
                          placeholder="sk_live_... or sk_test_..."
                          value={form.stripe_secret_key}
                          onChange={e => setForm(f => ({ ...f, stripe_secret_key: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">GST Tax Rate ID</label>
                        <input
                          type="text"
                          placeholder="txr_..."
                          value={form.stripe_gst_rate_id}
                          onChange={e => setForm(f => ({ ...f, stripe_gst_rate_id: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">{recipientCompanyName} Customer ID</label>
                        <input
                          type="text"
                          placeholder="cus_..."
                          value={form.stripe_customer_id}
                          onChange={e => setForm(f => ({ ...f, stripe_customer_id: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">Company name (sender)</label>
                        <input
                          type="text"
                          value={form.company_name}
                          onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">Billing email</label>
                        <input
                          type="email"
                          value={form.billing_email}
                          onChange={e => setForm(f => ({ ...f, billing_email: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">Billing address <span className="text-[#9CA3AF]">(optional)</span></label>
                        <input
                          type="text"
                          value={form.billing_address}
                          onChange={e => setForm(f => ({ ...f, billing_address: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                      </div>
                    </div>
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <button
                      onClick={handleVerify}
                      disabled={saving || !form.stripe_secret_key || !form.stripe_gst_rate_id || !form.stripe_customer_id || !form.company_name || !form.billing_email}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Verifying…' : 'Save & Verify'}
                    </button>
                  </div>
                )}
                {idx === 5 && (
                  <p className="text-sm text-[#374151] dark:text-[#CBD5E1]">
                    Set your invoice reminder day in the <strong>Invoice Reminder</strong> section below.
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
