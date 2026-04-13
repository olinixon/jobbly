'use client'

interface Props {
  stripeConnected: boolean
}

export default function PaymentMethodSelector({ stripeConnected }: Props) {
  return (
    <div className="flex gap-3 flex-wrap">
      {/* Stripe — selected / active */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1e3a5f]/40 dark:border-[#3B82F6] min-w-36">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#1D4ED8] dark:text-[#3B82F6]">Stripe</span>
          <span className="text-xs text-[#2563EB] dark:text-[#60A5FA]">
            {stripeConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="ml-auto">
          <div className="w-4 h-4 rounded-full border-2 border-[#2563EB] flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
          </div>
        </div>
      </div>

      {/* MYOB — coming soon */}
      <div className="relative flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A] min-w-36 opacity-60 cursor-not-allowed select-none">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1]">MYOB</span>
          <span className="text-xs text-[#9CA3AF] dark:text-[#475569]">Coming soon</span>
        </div>
      </div>

      {/* Xero — coming soon */}
      <div className="relative flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A] min-w-36 opacity-60 cursor-not-allowed select-none">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1]">Xero</span>
          <span className="text-xs text-[#9CA3AF] dark:text-[#475569]">Coming soon</span>
        </div>
      </div>
    </div>
  )
}
