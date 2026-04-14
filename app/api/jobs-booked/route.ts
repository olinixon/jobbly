import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'SUBCONTRACTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const leads = await prisma.lead.findMany({
    where: {
      campaignId: session.user.campaignId!,
      status: 'JOB_BOOKED',
      is_test: false,
    },
    include: {
      booking: {
        include: { slot: true },
      },
    },
    orderBy: { jobBookedDate: 'asc' },
  })

  const now = new Date()
  const nzToday = new Date(now.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }))

  const result = leads.map((lead) => {
    const booking = lead.booking
    const slot = booking?.slot

    // Use job_booked_date as primary; fall back to booking slot date for legacy leads
    const bookedDateStr = lead.jobBookedDate
      ? lead.jobBookedDate.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
      : slot
      ? slot.date.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
      : null

    let daysUntil: string | null = null
    if (bookedDateStr) {
      const bookedDay = new Date(bookedDateStr)
      const diff = Math.round((bookedDay.getTime() - nzToday.getTime()) / (1000 * 60 * 60 * 24))
      if (diff === 0) daysUntil = 'Today'
      else if (diff === 1) daysUntil = 'Tomorrow'
      else if (diff > 1) daysUntil = `${diff} days`
      else daysUntil = `${Math.abs(diff)} days ago`
    }

    return {
      id: lead.id,
      quoteNumber: lead.quoteNumber,
      customerName: lead.customerName,
      propertyAddress: lead.propertyAddress,
      bookedDateStr,
      daysUntil,
    }
  })

  // Sort by bookedDateStr ascending (nulls last)
  result.sort((a, b) => {
    if (!a.bookedDateStr) return 1
    if (!b.bookedDateStr) return -1
    return a.bookedDateStr.localeCompare(b.bookedDateStr)
  })

  return NextResponse.json(result)
}
