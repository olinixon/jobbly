import Link from 'next/link'
import Badge from '@/components/ui/Badge'

interface Campaign {
  id: string
  name: string
  industry: string
  clientCompanyName: string
  status: string
  startDate: Date
}

export default function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{campaign.name}</h3>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mt-0.5">{campaign.clientCompanyName}</p>
        </div>
        <Badge status={campaign.status} type="campaign" />
      </div>
      <p className="text-xs text-[#9CA3AF] dark:text-[#475569]">
        {campaign.industry} &middot; Started {new Date(campaign.startDate).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: 'short', day: 'numeric' })}
      </p>
      <Link
        href={`/dashboard?campaignId=${campaign.id}`}
        className="mt-auto inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-[#2563EB] text-white rounded-lg hover:bg-[#1D4ED8] transition-colors"
      >
        Enter Campaign →
      </Link>
    </div>
  )
}
