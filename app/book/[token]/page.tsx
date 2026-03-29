import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import BookingFlow from '@/components/booking/BookingFlow'
import BookedScreen from '@/components/booking/BookedScreen'

// This page is publicly accessible — no auth required.
// The booking token acts as the access key.

function formatBookingDate(date: Date): string {
  return date.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const lead = await prisma.lead.findUnique({
    where: { bookingToken: token },
    include: {
      jobType: true,
      booking: { include: { slot: true } },
      campaign: {
        include: {
          jobTypes: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  })

  if (!lead) notFound()

  type QuoteOption = {
    sort_order: number
    name: string
    price_ex_gst: number | null
    price_incl_gst: number | null
    duration_minutes: number | null
    job_type_id: string | null
  }

  const quoteOptions = Array.isArray(lead.quoteOptions) && (lead.quoteOptions as QuoteOption[]).length > 0
    ? (lead.quoteOptions as QuoteOption[])
    : null

  const fallbackOptions: QuoteOption[] = lead.campaign.jobTypes.map((jt) => ({
    sort_order: jt.sortOrder,
    name: jt.name,
    price_ex_gst: null,
    price_incl_gst: null,
    duration_minutes: jt.durationMinutes,
    job_type_id: jt.id,
  }))

  // Already booked state — show BookedScreen client component
  if (lead.status === 'JOB_BOOKED' || lead.status === 'JOB_COMPLETED') {
    const booking = lead.booking
    const bookingDate = booking ? formatBookingDate(booking.slot.date) : ''
    const slotDateNZ = booking
      ? booking.slot.date.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
      : ''

    return (
      <main className="min-h-screen bg-[#F4F4F5] flex flex-col">
        <header className="bg-[#18181b] px-6 py-4">
          <div className="max-w-xl mx-auto">
            <div className="text-xl font-bold text-white tracking-tight">Jobbly</div>
            <div className="text-xs text-[#A1A1AA]">by Omniside AI</div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          {lead.status === 'JOB_COMPLETED' ? (
            <div className="max-w-sm w-full bg-white rounded-2xl border border-[#E4E4E7] p-8 text-center shadow-sm">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-[#18181b] mb-2">Job completed</h1>
              <p className="text-sm text-[#71717A]">Thank you for choosing us.</p>
            </div>
          ) : booking ? (
            <BookedScreen
              token={token}
              quoteNumber={lead.quoteNumber}
              customerName={lead.customerName}
              propertyAddress={lead.propertyAddress}
              quoteUrl={lead.quoteUrl}
              bookingDate={bookingDate}
              windowStart={booking.windowStart}
              windowEnd={booking.windowEnd}
              slotDateNZ={slotDateNZ}
              bookingId={booking.id}
              preSelectedJobTypeId={lead.jobTypeId}
              quoteOptions={quoteOptions}
              fallbackOptions={fallbackOptions}
            />
          ) : (
            <div className="max-w-sm w-full bg-white rounded-2xl border border-[#E4E4E7] p-8 text-center shadow-sm">
              <h1 className="text-xl font-bold text-[#18181b] mb-2">Your job is booked</h1>
              <div className="flex justify-between text-sm mt-4">
                <span className="text-[#71717A]">Address</span>
                <span className="font-medium text-[#18181b] text-right ml-4">{lead.propertyAddress}</span>
              </div>
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F4F4F5] flex flex-col">
      <header className="bg-[#18181b] px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-xl font-bold text-white tracking-tight">Jobbly</div>
          <div className="text-xs text-[#A1A1AA]">by Omniside AI</div>
        </div>
      </header>

      <div className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <BookingFlow
            token={token}
            quoteNumber={lead.quoteNumber}
            customerName={lead.customerName}
            propertyAddress={lead.propertyAddress}
            quoteUrl={lead.quoteUrl}
            quoteOptions={quoteOptions}
            fallbackOptions={fallbackOptions}
          />
        </div>
      </div>
    </main>
  )
}
