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

  function handleToggleClick() {
    if (loading) return
    if (sandboxActive) {
      setConfirmDisable(true)
    } else {
      enableSandbox()
    }
  }

  // Inline confirmation when turning off
  if (confirmDisable) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Delete test lead?</span>
        <button
          onClick={disableSandbox}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? 'Turning off…' : 'Turn off'}
        </button>
        <button
          onClick={() => setConfirmDisable(false)}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      role="switch"
      aria-checked={sandboxActive}
      onClick={handleToggleClick}
      disabled={loading}
      className="flex items-center gap-2 disabled:opacity-60 cursor-pointer"
      title={sandboxActive ? 'Sandbox on — click to turn off' : 'Sandbox off — click to enable'}
    >
      {/* Track */}
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
          sandboxActive ? 'bg-green-500' : 'bg-[#D1D5DB] dark:bg-[#4B5563]'
        } ${loading ? 'opacity-60' : ''}`}
      >
        {/* Thumb */}
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
            sandboxActive ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
        {/* Loading spinner overlaid on thumb */}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
          </span>
        )}
      </span>
      <span className="text-xs text-[#6B7280] dark:text-[#94A3B8] select-none">
        Sandbox
      </span>
    </button>
  )
}
