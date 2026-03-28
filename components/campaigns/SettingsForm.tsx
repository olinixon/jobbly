'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import JobTypesSection from '@/components/campaigns/JobTypesSection'
import AvailabilitySection from '@/components/campaigns/AvailabilitySection'

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
  customer_from_email?: string | null
  customer_from_name?: string | null
}

interface JobType {
  id: string
  name: string
  durationMinutes: number
  sortOrder: number
}

interface AvailabilitySlot {
  id: string
  date: string
  startTime: string
  endTime: string
  notes: string | null
  createdAt: string
  confirmedBookings: number
}

export default function SettingsForm({ campaign, jobTypes, availabilitySlots }: { campaign: Campaign; jobTypes: JobType[]; availabilitySlots: AvailabilitySlot[] }) {
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

  const [customerEmail, setCustomerEmail] = useState({
    customer_from_name: campaign.customer_from_name ?? '',
    customer_from_email: campaign.customer_from_email ?? '',
  })
  const [customerEmailError, setCustomerEmailError] = useState<string | null>(null)

  const [status, setStatus] = useState(campaign.status)
  const [showDeactivateModal, setShowDeactivateModal] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [showCommissionWarning, setShowCommissionWarning] = useState(false)

  async function deactivateCampaign() {
    setDeactivating(true)
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    setDeactivating(false)
    setShowDeactivateModal(false)
    setStatus('COMPLETED')
    router.refresh()
  }

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
    <>
    {showCommissionWarning && (
      <Modal title="Update commission settings?" onClose={() => setShowCommissionWarning(false)}>
        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-6">
          This will affect all <strong>future leads</strong>. Existing leads will not be changed.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setShowCommissionWarning(false)}>Cancel</Button>
          <Button onClick={() => { setShowCommissionWarning(false); save('commission', commission) }} disabled={saving === 'commission'}>
            Confirm Update
          </Button>
        </div>
      </Modal>
    )}
    {showDeactivateModal && (
      <Modal title="Deactivate Campaign?" onClose={() => setShowDeactivateModal(false)}>
        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
          This will set the campaign status to <strong>Completed</strong>. No new leads will be accepted. You can reactivate it from Campaign Status at any time.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setShowDeactivateModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={deactivateCampaign} disabled={deactivating}>
            {deactivating ? 'Deactivating…' : 'Deactivate Campaign'}
          </Button>
        </div>
      </Modal>
    )}
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

      {/* Section 2: Customer Emails */}
      <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-1">Customer Emails</h2>
        <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mb-5">The sender name and email address that customers see when they receive quotes and booking confirmations. If left blank, emails will be sent from the default Jobbly address.</p>
        <div className="space-y-4">
          <Input
            label="Sender name"
            placeholder="e.g. Continuous Group"
            value={customerEmail.customer_from_name}
            onChange={(e) => setCustomerEmail({ ...customerEmail, customer_from_name: e.target.value })}
          />
          <Input
            label="Sender email address"
            type="email"
            placeholder="e.g. hello@continuousgroup.co.nz"
            value={customerEmail.customer_from_email}
            onChange={(e) => { setCustomerEmail({ ...customerEmail, customer_from_email: e.target.value }); setCustomerEmailError(null) }}
          />
          <div className="text-xs text-[#6B7280] dark:text-[#94A3B8] bg-[#F9FAFB] dark:bg-[#0F172A] rounded-lg px-4 py-2">
            {customerEmail.customer_from_email
              ? <>Emails will be sent from: <span className="font-medium text-[#111827] dark:text-[#F1F5F9]">{customerEmail.customer_from_name ? `${customerEmail.customer_from_name} <${customerEmail.customer_from_email}>` : customerEmail.customer_from_email}</span></>
              : <>Emails will be sent from: <span className="italic">[default — {process.env.NEXT_PUBLIC_DEFAULT_FROM_LABEL ?? 'Jobbly default'}]</span></>
            }
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            ⚠️ <strong>Important:</strong> The sender domain must be verified in Resend before emails will send from this address. Contact Oli to set this up before saving a new address.
          </div>
        </div>
        {customerEmailError && <p className="mt-3 text-sm text-[#DC2626]">{customerEmailError}</p>}
        {success === 'customerEmail' && <p className="mt-3 text-sm text-[#16A34A]">Settings saved.</p>}
        <div className="mt-5">
          <Button
            onClick={() => {
              const email = customerEmail.customer_from_email.trim()
              if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                setCustomerEmailError('Please enter a valid email address')
                return
              }
              save('customerEmail', {
                customer_from_email: email || null,
                customer_from_name: customerEmail.customer_from_name.trim() || null,
              })
            }}
            disabled={saving === 'customerEmail'}
          >
            {saving === 'customerEmail' ? 'Saving…' : 'Save Email Settings'}
          </Button>
        </div>
      </section>

      {/* Section 3: Commission & Pricing */}
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
          <Button onClick={() => setShowCommissionWarning(true)} disabled={saving === 'commission'}>
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
      {/* Section 5a: Job Types */}
      <JobTypesSection campaignId={campaign.id} initialJobTypes={jobTypes} />

      {/* Section 5b: Booking Availability */}
      <AvailabilitySection campaignId={campaign.id} initialSlots={availabilitySlots} jobTypes={jobTypes} />

      {/* Section 4: Danger Zone */}
      <section className="bg-white dark:bg-[#1E293B] border border-[#DC2626]/30 rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#DC2626] mb-2">Danger Zone</h2>
        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">Deactivating the campaign sets its status to Completed and stops new leads from being accepted.</p>
        <button
          onClick={() => setShowDeactivateModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors"
        >
          Deactivate Campaign
        </button>
      </section>
    </div>
    </>
  )
}
