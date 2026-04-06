'use client'

import { useState } from 'react'

interface Props {
  initialDay: number | null
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export default function InvoiceReminderSettings({ initialDay }: Props) {
  const [day, setDay] = useState<number | null>(initialDay)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  async function save(value: number | null) {
    setSaving(true)
    setSuccess(false)
    try {
      await fetch('/api/settings/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_day: value }),
      })
      setDay(value)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">
          Send me an invoice reminder on the…
        </label>
        <select
          value={day ?? ''}
          onChange={e => setDay(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB] appearance-none"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: '2rem' }}
        >
          <option value="">— no reminder —</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
            <option key={d} value={d}>{ordinal(d)}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-[#9CA3AF] dark:text-[#475569]">
          You'll receive an email on this day each month with a link to send your invoice.
        </p>
        <p className="mt-1 text-xs text-[#9CA3AF] dark:text-[#475569]">
          Note: if your chosen day doesn't exist in a given month (e.g. the 31st in April), the reminder will fire on the last day of that month instead.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => { if (day != null) save(day) }}
          disabled={saving || day == null}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save reminder'}
        </button>

        {initialDay != null && (
          <button
            onClick={() => save(null)}
            disabled={saving}
            className="text-sm text-[#6B7280] dark:text-[#94A3B8] hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            Disable reminders
          </button>
        )}
      </div>

      {success && <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>}
    </div>
  )
}
