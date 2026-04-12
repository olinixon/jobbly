'use client'

import { useState } from 'react'

interface WebhookSetupProps {
  webhookUrl: string
  hasExistingSecret: boolean
}

export default function WebhookSetup({ webhookUrl, hasExistingSecret }: WebhookSetupProps) {
  const [guideOpen, setGuideOpen] = useState(!hasExistingSecret)
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [secretSaved, setSecretSaved] = useState(hasExistingSecret)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaveStatus('idle')
    setTestResult(null)
    const res = await fetch('/api/settings/stripe/webhook-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_secret: secret }),
    })
    setSaving(false)
    if (res.ok) {
      setSaveStatus('saved')
      setSecretSaved(true)
      setSecret('')
    } else {
      setSaveStatus('error')
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/api/settings/stripe/test-webhook', { method: 'POST' })
    const data = await res.json()
    setTesting(false)
    if (res.ok && data.status === 'connected') {
      setTestResult({ ok: true, message: 'Connected — Jobbly will be notified when customers pay.' })
    } else {
      setTestResult({ ok: false, message: data.message ?? data.error ?? 'Could not verify — please check the secret and try again.' })
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
        So Jobbly can confirm when customers have paid, register your webhook URL in Stripe and paste the signing secret below.
      </p>

      {/* Collapsible guide */}
      <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setGuideOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
        >
          <span>How to set this up — takes 2 minutes</span>
          <span className="text-[#9CA3AF]">{guideOpen ? '▲' : '▼'}</span>
        </button>
        {guideOpen && (
          <div className="px-4 pb-4 border-t border-[#F3F4F6] dark:border-[#334155] pt-3 space-y-3 text-sm text-[#6B7280] dark:text-[#94A3B8]">
            <p><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 1</strong> — In your Stripe dashboard, go to <strong>Developers → Webhooks</strong></p>
            <p><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 2</strong> — Click <strong>Add endpoint</strong></p>
            <div>
              <p className="mb-2"><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 3</strong> — Paste this URL:</p>
              <div className="flex items-center gap-2 bg-[#F9FAFB] dark:bg-[#0F172A] border border-[#E5E7EB] dark:border-[#334155] rounded-lg px-3 py-2">
                <code className="text-xs text-[#111827] dark:text-[#F1F5F9] flex-1 break-all">{webhookUrl}</code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-xs text-[#2563EB] dark:text-[#3B82F6] hover:underline whitespace-nowrap shrink-0"
                >
                  {copied ? 'Copied ✓' : 'Copy URL'}
                </button>
              </div>
            </div>
            <p><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 4</strong> — Under <strong>Select events</strong>, choose: <code className="text-xs bg-[#F3F4F6] dark:bg-[#0F172A] px-1 py-0.5 rounded">checkout.session.completed</code></p>
            <p><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 5</strong> — Click <strong>Add endpoint</strong>, then copy the Signing Secret shown</p>
            <p><strong className="text-[#374151] dark:text-[#CBD5E1]">Step 6</strong> — Paste it in the field below and click <strong>Save</strong></p>
          </div>
        )}
      </div>

      {/* Secret input + save */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">
          Webhook Signing Secret
        </label>
        <input
          type="password"
          value={secret}
          onChange={(e) => { setSecret(e.target.value); setSaveStatus('idle') }}
          placeholder="whsec_..."
          className="w-full px-3 py-2 text-sm border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !secret.trim()}
            className="px-4 py-2 text-sm font-medium bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] rounded-lg hover:bg-[#374151] dark:hover:bg-[#CBD5E1] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Webhook Secret'}
          </button>
          {saveStatus === 'saved' && (
            <span className="text-sm text-green-600 dark:text-green-400">Saved ✓</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-sm text-[#DC2626]">Save failed — check the format and try again.</span>
          )}
        </div>
      </div>

      {/* Test connection — shown once secret is saved */}
      {secretSaved && (
        <div className="pt-4 border-t border-[#F3F4F6] dark:border-[#334155] space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 text-sm font-medium border border-[#D1D5DB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] disabled:opacity-60 transition-colors"
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          </div>
          {testResult && (
            <p className={`text-sm ${testResult.ok ? 'text-green-600 dark:text-green-400' : 'text-[#DC2626]'}`}>
              {testResult.ok ? '✅' : '❌'} {testResult.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
