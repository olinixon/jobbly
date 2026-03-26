import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import CampaignCard from '@/components/campaigns/CampaignCard'
import Footer from '@/components/layout/Footer'
import ThemeToggle from '@/components/layout/ThemeToggle'
import Link from 'next/link'

export default async function CampaignsPage() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A] flex flex-col">
      <header className="px-8 py-5 flex items-center justify-between border-b border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#1E293B]">
        <h1 className="text-xl font-bold text-[#2563EB] dark:text-[#3B82F6]">Jobbly</h1>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <span className="text-sm text-[#6B7280] dark:text-[#94A3B8]">👤 {session.user.name}</span>
        </div>
      </header>

      <main className="flex-1 px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9]">Campaigns</h2>
            <p className="mt-1 text-sm text-[#6B7280] dark:text-[#94A3B8]">
              Select a campaign to view its dashboard
            </p>
          </div>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#2563EB] text-white rounded-lg hover:bg-[#1D4ED8] transition-colors"
          >
            + New Campaign
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <div className="text-center py-16 text-[#6B7280] dark:text-[#94A3B8]">
            No campaigns yet. Create your first one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
