import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import JobsBookedTable from '@/components/jobs/JobsBookedTable'

export default async function JobsBookedPage() {
  const session = await auth()
  if (!session || session.user.role !== 'SUBCONTRACTOR') redirect('/dashboard')

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const leads = await prisma.lead.findMany({
    where: {
      campaignId: session.user.campaignId!,
      status: 'JOB_BOOKED',
    },
    include: {
      booking: { include: { slot: true } },
    },
  })

  const nzTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
  const nzToday = new Date(nzTodayStr)

  const jobs = leads
    .map((lead) => {
      const booking = lead.booking
      const slot = booking?.slot
      const slotDateNZ = slot
        ? slot.date.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
        : null

      let daysUntil: string | null = null
      if (slotDateNZ) {
        const slotDay = new Date(slotDateNZ)
        const diff = Math.round((slotDay.getTime() - nzToday.getTime()) / (1000 * 60 * 60 * 24))
        if (diff === 0) daysUntil = 'Today'
        else if (diff === 1) daysUntil = 'Tomorrow'
        else if (diff > 1) daysUntil = `${diff} days`
        else daysUntil = `${Math.abs(diff)} days ago`
      }

      let bookedAgo: string | null = null
      if (lead.jobBookedDate) {
        const bookedDateNZ = lead.jobBookedDate.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
        const bookedDay = new Date(bookedDateNZ)
        const diff = Math.round((nzToday.getTime() - bookedDay.getTime()) / (1000 * 60 * 60 * 24))
        if (diff === 0) bookedAgo = 'Today'
        else if (diff === 1) bookedAgo = 'Yesterday'
        else bookedAgo = `${diff} days ago`
      }

      return {
        id: lead.id,
        quoteNumber: lead.quoteNumber,
        customerName: lead.customerName,
        propertyAddress: lead.propertyAddress,
        jobBookedDate: lead.jobBookedDate?.toISOString() ?? null,
        slotDateNZ,
        windowStart: booking?.windowStart ?? null,
        windowEnd: booking?.windowEnd ?? null,
        daysUntil,
        bookedAgo,
      }
    })
    .sort((a, b) => {
      if (!a.slotDateNZ) return 1
      if (!b.slotDateNZ) return -1
      return a.slotDateNZ.localeCompare(b.slotDateNZ)
    })

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9]">Jobs Booked</h1>
        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mt-1">
          Jobs that have been booked by customers and are waiting to be completed.
        </p>
      </div>
      <JobsBookedTable jobs={jobs} />
    </AppShell>
  )
}
