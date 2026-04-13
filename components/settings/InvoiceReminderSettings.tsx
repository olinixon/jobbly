'use client'

import { useState } from 'react'

interface Props {
  initialDay: number | null
  initialAutoSend: boolean
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export default function InvoiceReminderSettings({ initialDay, initialAutoSend }: Props) {
  const [day, setDay] = useState<number | null>(initialDay)
  const [autoSend, setAutoSend] = useState(initialAutoSend)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  async function save(values: { reminder_day: number | null; auto_send: boolean }) {
    setSaving(true)
    setSuccess(false)
    try {
      await fetch('/api/settings/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      setDay(values.reminder_day)
      setAutoSend(values.auto_send)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
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

      {/* Auto-send toggle */}
      <div className={`rounded-lg border p-4 ${day == null ? 'border-[#E5E7EB] dark:border-[#334155] opacity-50' : 'border-[#E5E7EB] dark:border-[#334155]'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1]">Automatically send invoice on this date</p>
            {day == null ? (
              <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-0.5">Set a reminder day above to enable auto-send.</p>
            ) : autoSend ? (
              <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-0.5">Invoice will be generated and sent automatically via Stripe on the {ordinal(day)} each month.</p>
            ) : (
              <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mt-0.5">A reminder email will be sent to you on the {ordinal(day)} — you review and send manually.</p>
            )}
          </div>
          <button
            type="button"
            disabled={day == null}
            onClick={() => !saving && day != null && setAutoSend(v => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 ${
              autoSend ? 'bg-[#2563EB]' : 'bg-[#D1D5DB] dark:bg-[#4B5563]'
            } ${day == null ? 'cursor-not-allowed' : ''}`}
            role="switch"
            aria-checked={autoSend}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${autoSend ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => { if (day != null) save({ reminder_day: day, auto_send: autoSend }) }}
          disabled={saving || day == null}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save reminder'}
        </button>

        {initialDay != null && (
          <button
            onClick={() => save({ reminder_day: null, auto_send: false })}
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
