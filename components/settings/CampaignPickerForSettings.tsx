'use client'

import { useRouter } from 'next/navigation'

interface Campaign {
  id: string
  name: string
  clientCompanyName: string
}

export default function CampaignPickerForSettings({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter()

  return (
    <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
      <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-1">Select campaign to configure</h2>
      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
        Choose which campaign you want to configure settings for.
      </p>
      <select
        defaultValue=""
        onChange={e => {
          if (e.target.value) router.push(`/settings?campaignId=${e.target.value}`)
        }}
        className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
      >
        <option value="" disabled>Select a campaign…</option>
        {campaigns.map(c => (
          <option key={c.id} value={c.id}>
            {c.name} — {c.clientCompanyName}
          </option>
        ))}
      </select>
    </section>
  )
}
