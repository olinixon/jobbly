'use client'

import { useState } from 'react'

interface JobType {
  id: string
  name: string
  sortOrder: number
  durationMinutes: number | null
}

interface ManualQuoteOptionsProps {
  quoteNumber: string
  jobTypes: JobType[]
  onSaved?: () => void
}

export default function ManualQuoteOptions({ quoteNumber, jobTypes, onSaved }: ManualQuoteOptionsProps) {
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(jobTypes.map(jt => [jt.id, '']))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  function handleChange(id: string, val: string) {
    setPrices(prev => ({ ...prev, [id]: val }))
    setSaved(false)
  }

  async function handleSave() {
    const options = jobTypes
      .map((jt, i) => {
        const raw = prices[jt.id]
        const exGst = raw !== '' ? parseFloat(raw) : null
        return {
          sort_order: i + 1,
          name: jt.name,
          price_ex_gst: exGst,
          price_incl_gst: exGst != null ? Math.round(exGst * 1.15 * 100) / 100 : null,
          duration_minutes: jt.durationMinutes,
          job_type_id: jt.id,
        }
      })
      .filter(o => o.price_ex_gst != null)

    if (options.length === 0) {
      setError('Enter at least one price.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/leads/${quoteNumber}/quote-options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_options: options }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to save.')
      } else {
        setSaved(true)
        onSaved?.()
      }
    } catch {
      setError('Failed to save.')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">Enter prices ex. GST for each service option. Leave blank to exclude.</p>
      {jobTypes.map(jt => (
        <div key={jt.id} className="flex items-center gap-3">
          <span className="flex-1 text-sm text-[#111827] dark:text-[#F1F5F9]">{jt.name}</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-[#6B7280]">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={prices[jt.id]}
              onChange={e => handleChange(jt.id, e.target.value)}
              className="w-24 text-sm rounded-lg border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            {prices[jt.id] !== '' && !isNaN(parseFloat(prices[jt.id])) && (
              <span className="text-xs text-[#6B7280] dark:text-[#94A3B8] w-28">
                = ${(parseFloat(prices[jt.id]) * 1.15).toFixed(2)} incl.
              </span>
            )}
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-xs text-green-600 dark:text-green-400">Saved — reload to see updated options</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-1 px-4 py-2 text-sm bg-[#18181b] text-white rounded-lg disabled:opacity-40 hover:bg-[#27272a] transition-colors"
      >
        {saving ? 'Saving…' : 'Save prices'}
      </button>
    </div>
  )
}
