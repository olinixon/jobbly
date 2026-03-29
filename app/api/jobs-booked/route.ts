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

    let slotDateNZ: string | null = null
    let windowStart: string | null = null
    let windowEnd: string | null = null
    let daysUntil: string | null = null

    if (slot) {
      slotDateNZ = slot.date.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
      windowStart = booking!.windowStart
      windowEnd = booking!.windowEnd

      const slotDay = new Date(slotDateNZ)
      const diff = Math.round((slotDay.getTime() - nzToday.getTime()) / (1000 * 60 * 60 * 24))
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
      jobBookedDate: lead.jobBookedDate,
      slotDateNZ,
      windowStart,
      windowEnd,
      daysUntil,
    }
  })

  // Sort by slot date ascending (null slot dates go last)
  result.sort((a, b) => {
    if (!a.slotDateNZ) return 1
    if (!b.slotDateNZ) return -1
    return a.slotDateNZ.localeCompare(b.slotDateNZ)
  })

  return NextResponse.json(result)
}
