import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function getCheckoutUrl(token: string): Promise<string | null> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(`${appUrl}/api/portal/${token}/create-checkout`, {
      method: 'POST',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.checkoutUrl ?? null
  } catch {
    return null
  }
}

function isPdf(url: string): boolean {
  return url.toLowerCase().includes('.pdf')
}

export default async function CustomerPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  const { token } = await params
  const sp = await searchParams
  const isPaid = sp.paid === 'true'

  const lead = await prisma.lead.findUnique({
    where: { customerPortalToken: token },
    select: {
      customerName: true,
      propertyAddress: true,
      invoiceUrl: true,
      jobReportUrl: true,
    },
  })

  if (!lead) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-[#111827] text-lg font-semibold mb-2">Link not found</p>
          <p className="text-[#6B7280] text-sm">This link is invalid or has expired. Please contact us.</p>
        </div>
      </div>
    )
  }

  const checkoutUrl = isPaid ? null : await getCheckoutUrl(token)

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB] px-6 py-4">
        <span className="text-xl font-bold text-[#111827] tracking-tight">Jobbly</span>
        <span className="text-xs text-[#6B7280] ml-2">by Omniside AI</span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Hero */}
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">✓</span>
            <h1 className="text-xl font-bold text-[#111827]">Your Gutter Clean Is Complete</h1>
          </div>
          <p className="text-[#6B7280] text-sm ml-9">
            {lead.customerName} · {lead.propertyAddress}
          </p>
        </div>

        {/* Invoice */}
        {lead.invoiceUrl && (
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-[#111827] mb-4 flex items-center gap-2">
              <span>📄</span> Invoice
            </h2>
            {/* Mobile: download button only */}
            <div className="block md:hidden">
              <a
                href={lead.invoiceUrl}
                download
                className="w-full block text-center px-4 py-3 bg-[#111827] text-white font-semibold rounded-xl text-sm"
              >
                Download Invoice
              </a>
            </div>
            {/* Desktop: iframe + download link */}
            <div className="hidden md:block">
              {isPdf(lead.invoiceUrl) ? (
                <>
                  <iframe
                    src={lead.invoiceUrl}
                    className="w-full rounded-lg border border-[#E5E7EB]"
                    style={{ height: '500px' }}
                    title="Invoice"
                  />
                  <div className="mt-3">
                    <a href={lead.invoiceUrl} download className="text-sm text-[#2563EB] hover:underline">
                      Download Invoice
                    </a>
                  </div>
                </>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lead.invoiceUrl} alt="Invoice" className="w-full rounded-lg border border-[#E5E7EB]" />
                  <div className="mt-3">
                    <a href={lead.invoiceUrl} download className="text-sm text-[#2563EB] hover:underline">
                      Download Invoice
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Job Report */}
        {lead.jobReportUrl && (
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-[#111827] mb-4 flex items-center gap-2">
              <span>📋</span> Job Report
            </h2>
            {/* Mobile: download button only */}
            <div className="block md:hidden">
              <a
                href={lead.jobReportUrl}
                download
                className="w-full block text-center px-4 py-3 bg-[#111827] text-white font-semibold rounded-xl text-sm"
              >
                Download Job Report
              </a>
            </div>
            {/* Desktop: iframe + download link */}
            <div className="hidden md:block">
              {isPdf(lead.jobReportUrl) ? (
                <>
                  <iframe
                    src={lead.jobReportUrl}
                    className="w-full rounded-lg border border-[#E5E7EB]"
                    style={{ height: '500px' }}
                    title="Job Report"
                  />
                  <div className="mt-3">
                    <a href={lead.jobReportUrl} download className="text-sm text-[#2563EB] hover:underline">
                      Download Job Report
                    </a>
                  </div>
                </>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lead.jobReportUrl} alt="Job Report" className="w-full rounded-lg border border-[#E5E7EB]" />
                  <div className="mt-3">
                    <a href={lead.jobReportUrl} download className="text-sm text-[#2563EB] hover:underline">
                      Download Job Report
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Payment */}
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold text-[#111827] mb-4 flex items-center gap-2">
            <span>💳</span> Pay Your Invoice
          </h2>
          {isPaid ? (
            <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <span className="text-xl">✅</span>
              <div>
                <p className="font-semibold text-[#111827]">Payment received — thank you!</p>
                <p className="text-sm text-[#6B7280] mt-1">We&apos;ll be in touch to confirm.</p>
              </div>
            </div>
          ) : checkoutUrl ? (
            <a
              href={checkoutUrl}
              className="w-full block text-center px-4 py-3 bg-[#2563EB] text-white font-semibold rounded-xl text-sm hover:bg-[#1D4ED8] transition-colors"
            >
              Pay Invoice
            </a>
          ) : (
            <button
              disabled
              className="w-full px-4 py-3 bg-[#F3F4F6] text-[#9CA3AF] font-semibold rounded-xl text-sm cursor-not-allowed"
            >
              Payment link not yet available
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8">
        <p className="text-xs text-[#9CA3AF]">Powered by Jobbly</p>
      </footer>
    </div>
  )
}
