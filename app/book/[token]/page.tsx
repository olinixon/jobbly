import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import BookingSlotPicker from '@/components/booking/BookingSlotPicker'

// This page is publicly accessible — no auth required.
// The booking token acts as the access key.

function fmt12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

function formatBookingDate(date: Date): string {
  return date.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function generateWindows(startTime: string, endTime: string, durationMinutes: number) {
  const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  const windows = []
  let current = start
  while (current + durationMinutes <= end) {
    windows.push({ windowStart: toTime(current), windowEnd: toTime(current + durationMinutes) })
    current += durationMinutes
  }
  return windows
}

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const lead = await prisma.lead.findUnique({
    where: { bookingToken: token },
    include: {
      jobType: true,
      booking: { include: { slot: true } },
    },
  })

  if (!lead) notFound()

  const exGst = lead.customerPrice ?? 0
  const inclGst = exGst * 1.15

  // Already booked state
  if (lead.status === 'JOB_BOOKED' || lead.status === 'JOB_COMPLETED') {
    const booking = lead.booking
    return (
      <main className="min-h-screen bg-[#F4F4F5] flex flex-col">
        <header className="bg-[#18181b] px-6 py-4">
          <div className="max-w-xl mx-auto">
            <div className="text-xl font-bold text-white tracking-tight">Jobbly</div>
            <div className="text-xs text-[#A1A1AA]">by Omniside AI</div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full bg-white rounded-2xl border border-[#E4E4E7] p-8 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[#18181b] mb-4">Your job is booked</h1>
            <div className="text-left space-y-3">
              {booking && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#71717A]">Date</span>
                    <span className="font-medium text-[#18181b]">{formatBookingDate(booking.slot.date)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#71717A]">Time</span>
                    <span className="font-medium text-[#18181b]">{fmt12h(booking.windowStart)} – {fmt12h(booking.windowEnd)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[#71717A]">Address</span>
                <span className="font-medium text-[#18181b] text-right ml-4">{lead.propertyAddress}</span>
              </div>
            </div>
            <p className="text-sm text-[#71717A] mt-4">If you need to change your booking, please contact us.</p>
          </div>
        </div>
      </main>
    )
  }

  // Build initial slots for the picker (server-rendered to avoid loading flash)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rawSlots = await prisma.availabilitySlot.findMany({
    where: { campaignId: lead.campaignId, date: { gte: today } },
    orderBy: { date: 'asc' },
    include: {
      bookings: {
        select: { id: true, windowStart: true, windowEnd: true, status: true, heldUntil: true, heldByToken: true },
      },
    },
  })

  const now = new Date()
  const durationMinutes = lead.jobType?.durationMinutes ?? 120

  const initialSlots = rawSlots.map(slot => {
    const windows = generateWindows(slot.startTime, slot.endTime, durationMinutes)
    const windowsWithStatus = windows.map(w => {
      const confirmed = slot.bookings.find(b => b.windowStart === w.windowStart && b.windowEnd === w.windowEnd && b.status === 'CONFIRMED')
      if (confirmed) return null
      const activeHold = slot.bookings.find(b => b.windowStart === w.windowStart && b.windowEnd === w.windowEnd && b.status === 'HELD' && b.heldUntil && b.heldUntil > now && b.heldByToken !== token)
      const myHold = slot.bookings.find(b => b.windowStart === w.windowStart && b.windowEnd === w.windowEnd && b.status === 'HELD' && b.heldByToken === token)
      return { ...w, available: !activeHold, heldByMe: !!myHold && !!myHold.heldUntil && myHold.heldUntil > now, heldUntil: myHold?.heldUntil?.toISOString() ?? null }
    }).filter(Boolean)
    return { id: slot.id, date: slot.date.toISOString(), startTime: slot.startTime, endTime: slot.endTime, windows: windowsWithStatus as NonNullable<typeof windowsWithStatus[number]>[] }
  }).filter(s => s.windows.length > 0)

  return (
    <main className="min-h-screen bg-[#F4F4F5] flex flex-col">
      <header className="bg-[#18181b] px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-xl font-bold text-white tracking-tight">Jobbly</div>
          <div className="text-xs text-[#A1A1AA]">by Omniside AI</div>
        </div>
      </header>

      <div className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Quote details */}
          <div className="bg-white rounded-2xl border border-[#E4E4E7] p-6 shadow-sm">
            <h1 className="text-xl font-bold text-[#18181b] mb-1">Your gutter cleaning quote</h1>
            <p className="text-sm text-[#71717A] mb-4">Review your quote details and choose a booking time below.</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#71717A]">Customer</span>
                <span className="font-medium text-[#18181b]">{lead.customerName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#71717A]">Property</span>
                <span className="font-medium text-[#18181b] text-right ml-4">{lead.propertyAddress}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#71717A]">Quote number</span>
                <span className="font-medium text-[#18181b]">{lead.quoteNumber}</span>
              </div>
              {lead.jobType && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#71717A]">Job type</span>
                  <span className="font-medium text-[#18181b]">{lead.jobType.name}</span>
                </div>
              )}
              {lead.customerPrice && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#71717A]">Price</span>
                  <span className="font-medium text-[#18181b]">${exGst.toFixed(2)} + GST = ${inclGst.toFixed(2)} incl. GST</span>
                </div>
              )}
            </div>
            {lead.quoteUrl && (
              <a
                href={lead.quoteUrl}
                download
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-medium rounded-lg border border-[#E4E4E7] text-[#18181b] hover:bg-[#F4F4F5] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Quote
              </a>
            )}
          </div>

          {/* Slot picker */}
          <div className="bg-white rounded-2xl border border-[#E4E4E7] p-6 shadow-sm">
            <BookingSlotPicker
              token={token}
              jobTypeName={lead.jobType?.name ?? 'Gutter Clean'}
              durationMinutes={durationMinutes}
              initialSlots={initialSlots}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
