'use client'

import { useState, useRef } from 'react'

interface InternalNotesEditorProps {
  quoteNumber: string
  initialValue: string
}

export default function InternalNotesEditor({ quoteNumber, initialValue }: InternalNotesEditorProps) {
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleBlur() {
    if (value === initialValue) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${quoteNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internal_notes: value }),
      })
      if (!res.ok) {
        setError('Failed to save.')
      } else {
        setSaved(true)
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
        savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      setError('Failed to save.')
    }
    setSaving(false)
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setSaved(false) }}
        onBlur={handleBlur}
        rows={4}
        placeholder="Add internal notes…"
        className="w-full text-sm rounded-lg border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder:text-[#9CA3AF] dark:placeholder:text-[#475569] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2563EB] resize-none"
      />
      <div className="h-4 mt-1">
        {saving && <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Saving…</p>}
        {saved && <p className="text-xs text-green-600 dark:text-green-400">Saved</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  )
}
