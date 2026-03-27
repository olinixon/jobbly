import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getActiveCampaignId } from '@/lib/getActiveCampaignId'
import { computeUrgency } from '@/lib/urgency'
import Sidebar from './Sidebar'
import Footer from './Footer'
import ThemeToggle from './ThemeToggle'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  let needsActionCount = 0
  if (session.user.role === 'ADMIN' || session.user.role === 'SUBCONTRACTOR') {
    const campaignId = await getActiveCampaignId(session.user.campaignId, session.user.role)
    if (campaignId) {
      const activeLeads = await prisma.lead.findMany({
        where: { campaignId, status: { not: 'JOB_COMPLETED' } },
        select: { status: true, createdAt: true, jobBookedDate: true },
      })
      needsActionCount = activeLeads.filter(l => computeUrgency(l) !== null).length
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A]">
      <Sidebar role={session.user.role} userName={session.user.name} needsActionCount={needsActionCount} />
      <div className="flex-1 flex flex-col md:ml-56">
        <div className="flex justify-end p-4">
          <ThemeToggle />
        </div>
        <main className="flex-1 px-6 pb-6">{children}</main>
        <Footer />
      </div>
    </div>
  )
}
