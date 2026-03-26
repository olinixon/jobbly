'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function NewCampaignForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    industry: '',
    clientCompanyName: '',
    subcontractorCompanyName: '',
    markupPercentage: 25,
    commissionPercentage: 40,
    startDate: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) {
      setError('Failed to create campaign.')
      return
    }
    router.push('/campaigns')
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-4">
      <Input label="Campaign Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Input label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} required />
      <Input label="Client Company" value={form.clientCompanyName} onChange={(e) => setForm({ ...form, clientCompanyName: e.target.value })} required />
      <Input label="Subcontractor Company" value={form.subcontractorCompanyName} onChange={(e) => setForm({ ...form, subcontractorCompanyName: e.target.value })} required />
      <Input label="Client Markup %" type="number" min="0" max="100" step="0.01" value={form.markupPercentage} onChange={(e) => setForm({ ...form, markupPercentage: parseFloat(e.target.value) })} required />
      <Input label="Omniside Commission %" type="number" min="0" max="100" step="0.01" value={form.commissionPercentage} onChange={(e) => setForm({ ...form, commissionPercentage: parseFloat(e.target.value) })} required />
      <Input label="Start Date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
      {error && <p className="text-sm text-[#DC2626]">{error}</p>}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Campaign'}</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}
