'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'

interface Campaign {
  id: string
  name: string
  industry: string
  clientCompanyName: string
  subcontractorCompanyName: string
  markupPercentage: number
  commissionPercentage: number
  clientMarginPercentage: number
  status: string
  startDate: Date
}

export default function SettingsForm({ campaign }: { campaign: Campaign }) {
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [general, setGeneral] = useState({
    name: campaign.name,
    industry: campaign.industry,
    clientCompanyName: campaign.clientCompanyName,
    subcontractorCompanyName: campaign.subcontractorCompanyName,
    startDate: new Date(campaign.startDate).toISOString().split('T')[0],
  })

  const [commission, setCommission] = useState({
    markupPercentage: campaign.markupPercentage,
    commissionPercentage: campaign.commissionPercentage,
  })

  const [status, setStatus] = useState(campaign.status)

  async function save(section: string, data: Record<string, unknown>) {
    setSaving(section)
    setSuccess(null)
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setSaving(null)
    setSuccess(section)
    router.refresh()
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Section 1: General */}
      <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-5">General</h2>
        <div className="space-y-4">
          <Input label="Campaign Name" value={general.name} onChange={(e) => setGeneral({ ...general, name: e.target.value })} />
          <Input label="Industry" value={general.industry} onChange={(e) => setGeneral({ ...general, industry: e.target.value })} />
          <Input label="Client Company" value={general.clientCompanyName} onChange={(e) => setGeneral({ ...general, clientCompanyName: e.target.value })} />
          <Input label="Subcontractor Company" value={general.subcontractorCompanyName} onChange={(e) => setGeneral({ ...general, subcontractorCompanyName: e.target.value })} />
          <Input label="Start Date" type="date" value={general.startDate} onChange={(e) => setGeneral({ ...general, startDate: e.target.value })} />
        </div>
        {success === 'general' && <p className="mt-3 text-sm text-[#16A34A]">Saved.</p>}
        <div className="mt-5">
          <Button onClick={() => save('general', { ...general, startDate: new Date(general.startDate) })} disabled={saving === 'general'}>
            {saving === 'general' ? 'Saving…' : 'Save General'}
          </Button>
        </div>
      </section>

      {/* Section 2: Commission & Pricing */}
      <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-1">Commission & Pricing</h2>
        <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mb-5">Changes apply to future leads only. Existing records are not affected.</p>
        <div className="space-y-4">
          <Input
            label="Client Markup %"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={commission.markupPercentage}
            onChange={(e) => setCommission({ ...commission, markupPercentage: parseFloat(e.target.value) })}
          />
          <Input
            label="Omniside Commission %"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={commission.commissionPercentage}
            onChange={(e) => setCommission({ ...commission, commissionPercentage: parseFloat(e.target.value) })}
          />
          <div>
            <p className="text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">Client Margin %</p>
            <p className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">{(100 - commission.commissionPercentage).toFixed(2)}%</p>
            <p className="text-xs text-[#9CA3AF]">Auto-calculated: 100 − commission %</p>
          </div>
        </div>
        {success === 'commission' && <p className="mt-3 text-sm text-[#16A34A]">Saved.</p>}
        <div className="mt-5">
          <Button onClick={() => save('commission', commission)} disabled={saving === 'commission'}>
            {saving === 'commission' ? 'Saving…' : 'Save Commission'}
          </Button>
        </div>
      </section>

      {/* Section 3: Campaign Status */}
      <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-5">Campaign Status</h2>
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'ACTIVE', label: 'Active — accepting new leads' },
            { value: 'PAUSED', label: 'Paused — leads accepted but flagged' },
            { value: 'COMPLETED', label: 'Completed — no new leads accepted' },
          ]}
        />
        {success === 'status' && <p className="mt-3 text-sm text-[#16A34A]">Saved.</p>}
        <div className="mt-5">
          <Button onClick={() => save('status', { status })} disabled={saving === 'status'}>
            {saving === 'status' ? 'Saving…' : 'Save Status'}
          </Button>
        </div>
      </section>
    </div>
  )
}
