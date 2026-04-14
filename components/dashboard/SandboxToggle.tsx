'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SandboxToggleProps {
  sandboxActive: boolean
}

export default function SandboxToggle({ sandboxActive }: SandboxToggleProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  async function enableSandbox() {
    setLoading(true)
    try {
      const res = await fetch('/api/sandbox/enable', { method: 'POST' })
      if (res.ok) router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function disableSandbox() {
    setLoading(true)
    setConfirmDisable(false)
    try {
      const res = await fetch('/api/sandbox/disable', { method: 'POST' })
      if (res.ok) router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (sandboxActive) {
    return confirmDisable ? (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Delete test lead?</span>
        <button
          onClick={disableSandbox}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? 'Disabling…' : 'Yes, disable'}
        </button>
        <button
          onClick={() => setConfirmDisable(false)}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    ) : (
      <button
        onClick={() => setConfirmDisable(true)}
        disabled={loading}
        className="px-3 py-1.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 transition-colors"
      >
        Sandbox: On
      </button>
    )
  }

  return (
    <button
      onClick={enableSandbox}
      disabled={loading}
      className="px-3 py-1.5 text-xs font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] text-[#6B7280] dark:text-[#94A3B8] disabled:opacity-50 transition-colors"
    >
      {loading ? 'Enabling…' : 'Sandbox: Off'}
    </button>
  )
}
