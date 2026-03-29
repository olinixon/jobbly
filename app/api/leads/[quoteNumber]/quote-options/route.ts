import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

interface QuoteOption {
  sort_order: number
  name: string
  price_ex_gst: number | null
  price_incl_gst: number | null
  duration_minutes: number | null
  job_type_id: string | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ quoteNumber: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { quoteNumber } = await params
  const lead = await prisma.lead.findUnique({ where: { quoteNumber } })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role !== 'ADMIN' && lead.campaignId !== session.user.campaignId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const options: QuoteOption[] = body.quote_options

  if (!Array.isArray(options) || options.length === 0) {
    return NextResponse.json({ error: 'quote_options must be a non-empty array' }, { status: 400 })
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: { quoteOptions: options as object[] },
  })

  return NextResponse.json({ ok: true })
}
