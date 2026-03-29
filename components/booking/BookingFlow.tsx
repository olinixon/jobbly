'use client'

import { useState } from 'react'
import BookingSlotPicker from '@/components/booking/BookingSlotPicker'

export interface QuoteOption {
  sort_order: number
  name: string
  price_ex_gst: number | null
  price_incl_gst: number | null
  duration_minutes: number | null
  job_type_id: string | null
}

interface BookingFlowProps {
  token: string
  quoteNumber: string
  customerName: string
  propertyAddress: string
  quoteUrl: string | null
  quoteOptions: QuoteOption[] | null
  fallbackOptions: QuoteOption[]
}

export default function BookingFlow({
  token,
  quoteNumber,
  customerName,
  propertyAddress,
  quoteUrl,
  quoteOptions,
  fallbackOptions,
}: BookingFlowProps) {
  const options = quoteOptions ?? fallbackOptions
  const [selectedOption, setSelectedOption] = useState<QuoteOption | null>(null)
  const [step, setStep] = useState<'options' | 'slots'>('options')

  function handleContinue() {
    if (selectedOption) setStep('slots')
  }

  function handleBack() {
    setStep('options')
  }

  if (step === 'slots' && selectedOption) {
    return (
      <div className="space-y-6">
        {/* Selected option summary */}
        <div className="bg-white rounded-2xl border border-[#E4E4E7] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-[#18181b]">Your selection</h2>
            <button
              onClick={handleBack}
              className="text-sm text-[#2563EB] hover:underline"
            >
              ← Change
            </button>
          </div>
          <p className="text-sm font-medium text-[#18181b]">{selectedOption.name}</p>
          {selectedOption.price_incl_gst != null && (
            <p className="text-sm text-[#71717A]">
              ${selectedOption.price_ex_gst?.toFixed(2)} + GST = ${selectedOption.price_incl_gst.toFixed(2)} incl. GST
            </p>
          )}
        </div>

        {/* Slot picker */}
        <div className="bg-white rounded-2xl border border-[#E4E4E7] p-6 shadow-sm">
          <BookingSlotPicker
            token={token}
            jobTypeName={selectedOption.name}
            durationMinutes={selectedOption.duration_minutes ?? 120}
            initialSlots={[]}
            jobTypeId={selectedOption.job_type_id ?? undefined}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quote details */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] p-6 shadow-sm">
        <p className="text-sm text-[#71717A] mb-3">{quoteNumber} · {propertyAddress}</p>
        {quoteUrl && (
          <a
            href={quoteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[#E4E4E7] text-[#18181b] hover:bg-[#F4F4F5] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Quote
          </a>
        )}
      </div>

      {/* Step 1 — Choose service option */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[#18181b] mb-1">Choose your service</h1>
        <p className="text-sm text-[#71717A] mb-5">Select the option that suits you, then choose a time.</p>

        <div className="space-y-3">
          {options.map((opt) => {
            const isSelected = selectedOption?.sort_order === opt.sort_order
            return (
              <button
                key={opt.sort_order}
                type="button"
                onClick={() => setSelectedOption(opt)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-[#18181b] bg-[#18181b]/5'
                    : 'border-[#E4E4E7] hover:border-[#A1A1AA]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-[#18181b] text-sm">{opt.name}</p>
                    {opt.price_ex_gst != null && opt.price_incl_gst != null ? (
                      <p className="text-sm text-[#71717A] mt-0.5">
                        ${opt.price_ex_gst.toFixed(2)} + GST = ${opt.price_incl_gst.toFixed(2)} incl. GST
                      </p>
                    ) : (
                      <p className="text-sm text-[#A1A1AA] mt-0.5">See attached quote for pricing</p>
                    )}
                    {opt.duration_minutes && (
                      <p className="text-xs text-[#A1A1AA] mt-0.5">
                        Approx. {Math.floor(opt.duration_minutes / 60)} hour{opt.duration_minutes >= 120 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[#18181b] flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedOption}
          className="mt-5 w-full py-3 px-6 bg-[#18181b] text-white font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#27272a] transition-colors"
        >
          Continue to booking →
        </button>
      </div>
    </div>
  )
}
