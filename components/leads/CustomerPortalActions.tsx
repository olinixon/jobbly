'use client'

import { useState } from 'react'

interface CustomerPortalActionsProps {
  portalUrl: string
  quoteNumber: string
  customerEmail: string | null
}

export default function CustomerPortalActions({ portalUrl, quoteNumber, customerEmail }: CustomerPortalActionsProps) {
  const [copied, setCopied] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(portalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers that don't support clipboard API
      const el = document.createElement('textarea')
      el.value = portalUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function resendEmail() {
    setResending(true)
    setResendMsg('')
    const res = await fetch(`/api/leads/${quoteNumber}/resend-customer-email`, { method: 'POST' })
    setResending(false)
    if (res.ok) {
      setResendMsg(`Email resent to ${customerEmail} ✓`)
    } else {
      setResendMsg('Failed to send. Try again.')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={copyLink}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] hover:bg-[#374151] dark:hover:bg-[#E2E8F0] transition-colors"
        >
          {copied ? 'Copied ✓' : 'Copy Link'}
        </button>
        {customerEmail && (
          <button
            onClick={resendEmail}
            disabled={resending}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors disabled:opacity-50"
          >
            {resending ? 'Sending…' : 'Resend Email'}
          </button>
        )}
      </div>
      {resendMsg && (
        <p className={`text-xs ${resendMsg.includes('Failed') ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
          {resendMsg}
        </p>
      )}
    </div>
  )
}
