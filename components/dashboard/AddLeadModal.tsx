'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const EMPTY_FORM = {
  quote_number: '',
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  property_address: '',
  gutter_guards: '',
  property_storeys: '',
  notes: '',
}

export default function AddLeadModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!form.quote_number.trim()) next.quote_number = 'Required'
    if (!form.customer_name.trim()) next.customer_name = 'Required'
    if (!form.customer_phone.trim()) next.customer_phone = 'Required'
    if (!form.customer_email.trim()) next.customer_email = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer_email.trim())) next.customer_email = 'Must be a valid email address'
    if (!form.property_address.trim()) next.property_address = 'Required'
    if (!form.gutter_guards) next.gutter_guards = 'Please select Yes or No'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/leads/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        if (res.status === 409) {
          setErrors(prev => ({ ...prev, quote_number: data.message ?? 'Duplicate quote number.' }))
        } else {
          setErrors(prev => ({ ...prev, _form: data.message ?? 'Something went wrong.' }))
        }
        return
      }
      setOpen(false)
      setForm(EMPTY_FORM)
      setErrors({})
      setToast('Lead created successfully.')
      setTimeout(() => setToast(''), 4000)
      router.refresh()
    } catch {
      setErrors(prev => ({ ...prev, _form: 'Network error. Please try again.' }))
    } finally {
      setSubmitting(false)
    }
  }

  function close() {
    setOpen(false)
    setForm(EMPTY_FORM)
    setErrors({})
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#0F172A] transition-colors"
      >
        + Add Lead Manually
      </button>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-[#111827] dark:bg-[#F1F5F9] text-white dark:text-[#111827] text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Slide-over overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={close} />

          {/* Panel */}
          <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] h-full shadow-xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-[#E5E7EB] dark:border-[#334155]">
              <div>
                <h2 className="text-lg font-semibold text-[#111827] dark:text-[#F1F5F9]">Add Lead Manually</h2>
                <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mt-0.5">Use this when a lead couldn&apos;t be captured automatically via the AI campaign.</p>
              </div>
              <button onClick={close} className="ml-4 text-[#9CA3AF] dark:text-[#475569] hover:text-[#374151] dark:hover:text-[#CBD5E1] text-xl leading-none mt-0.5">✕</button>
            </div>

            {/* Form body */}
            <form id="add-lead-form" onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {errors._form && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{errors._form}</p>
              )}

              <Field label="Quote Number" required error={errors.quote_number}>
                <input
                  type="text"
                  value={form.quote_number}
                  onChange={e => set('quote_number', e.target.value)}
                  placeholder="e.g. QU00104"
                  className={inputCls(!!errors.quote_number)}
                />
              </Field>

              <Field label="Customer Name" required error={errors.customer_name}>
                <input
                  type="text"
                  value={form.customer_name}
                  onChange={e => set('customer_name', e.target.value)}
                  placeholder="Full name"
                  className={inputCls(!!errors.customer_name)}
                />
              </Field>

              <Field label="Phone Number" required error={errors.customer_phone}>
                <input
                  type="tel"
                  value={form.customer_phone}
                  onChange={e => set('customer_phone', e.target.value)}
                  placeholder="e.g. 021 123 4567"
                  className={inputCls(!!errors.customer_phone)}
                />
              </Field>

              <Field label="Email Address" required error={errors.customer_email}>
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={e => set('customer_email', e.target.value)}
                  placeholder="customer@example.com"
                  className={inputCls(!!errors.customer_email)}
                />
              </Field>

              <Field label="Property Address" required error={errors.property_address}>
                <input
                  type="text"
                  value={form.property_address}
                  onChange={e => set('property_address', e.target.value)}
                  placeholder="Full address"
                  className={inputCls(!!errors.property_address)}
                />
              </Field>

              <Field label="Gutter Guards" required error={errors.gutter_guards}>
                <select
                  value={form.gutter_guards}
                  onChange={e => set('gutter_guards', e.target.value)}
                  className={inputCls(!!errors.gutter_guards)}
                >
                  <option value="">Select…</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </Field>

              <Field label="Storeys" error={errors.property_storeys}>
                <select
                  value={form.property_storeys}
                  onChange={e => set('property_storeys', e.target.value)}
                  className={inputCls(false)}
                >
                  <option value="">Select…</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="Unsure">Unsure</option>
                </select>
              </Field>

              <Field label="Call Notes" error={errors.notes}>
                <textarea
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Notes from the call or customer interaction…"
                  rows={3}
                  className={inputCls(false) + ' resize-none'}
                />
              </Field>
            </form>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#E5E7EB] dark:border-[#334155] flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-[#374151] dark:text-[#CBD5E1] border border-[#E5E7EB] dark:border-[#334155] rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-[#0F172A] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="add-lead-form"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Create Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, required, error, children }: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  )
}

function inputCls(hasError: boolean) {
  return `w-full text-sm rounded-lg border ${
    hasError
      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
      : 'border-[#E5E7EB] dark:border-[#334155] focus:ring-[#2563EB] dark:focus:ring-[#3B82F6]'
  } bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] placeholder:text-[#9CA3AF] dark:placeholder:text-[#475569] px-3 py-2 focus:outline-none focus:ring-2`
}
