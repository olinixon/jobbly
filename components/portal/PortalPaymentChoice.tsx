'use client'

import { useState } from 'react'

interface PortalPaymentChoiceProps {
  portalToken: string
  customerPrice: number | null
  invoiceTotalGstInclusive: number | null
}

const SURCHARGE_RATE = 0.0265

export default function PortalPaymentChoice({
  portalToken,
  customerPrice,
  invoiceTotalGstInclusive,
}: PortalPaymentChoiceProps) {
  const [loading, setLoading] = useState<'card' | 'bank_transfer' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Base amount (GST-inclusive)
  const baseAmount = invoiceTotalGstInclusive ?? (customerPrice != null ? customerPrice * 1.15 : null)
  const cardTotal = baseAmount != null ? baseAmount * (1 + SURCHARGE_RATE) : null
  const bankTotal = baseAmount

  async function handlePay(method: 'card' | 'bank_transfer') {
    if (loading) return
    setLoading(method)
    setError(null)
    try {
      const res = await fetch(`/api/portal/${portalToken}/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: method }),
      })
      const data = await res.json()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        setError('Unable to create payment session. Please try again or contact us.')
        setLoading(null)
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  function fmt(n: number | null): string {
    if (n == null) return '—'
    return `$${n.toFixed(2)}`
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-[#374151]">How would you like to pay?</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card */}
        <div className="border border-[#E5E7EB] rounded-xl p-5 space-y-3">
          <div>
            <p className="font-semibold text-[#111827]">Pay by card</p>
            <p className="text-sm text-[#6B7280] mt-0.5">2.65% surcharge applies</p>
            <p className="text-base font-bold text-[#111827] mt-2">
              Total: {fmt(cardTotal)}
            </p>
          </div>
          <button
            onClick={() => handlePay('card')}
            disabled={!!loading}
            className="w-full px-4 py-3 bg-[#2563EB] text-white font-semibold rounded-xl text-sm hover:bg-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading === 'card' ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing…
              </>
            ) : 'Pay by card'}
          </button>
        </div>

        {/* Bank transfer */}
        <div className="border border-[#E5E7EB] rounded-xl p-5 space-y-3">
          <div>
            <p className="font-semibold text-[#111827]">Pay by bank transfer</p>
            <p className="text-sm text-[#6B7280] mt-0.5">Free — no fees</p>
            <p className="text-base font-bold text-[#111827] mt-2">
              Total: {fmt(bankTotal)}
            </p>
          </div>
          <button
            onClick={() => handlePay('bank_transfer')}
            disabled={!!loading}
            className="w-full px-4 py-3 bg-[#111827] text-white font-semibold rounded-xl text-sm hover:bg-[#374151] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading === 'bank_transfer' ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing…
              </>
            ) : 'Pay by bank transfer'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[#DC2626]">{error}</p>
      )}
    </div>
  )
}
