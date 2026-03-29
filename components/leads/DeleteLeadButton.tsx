'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  quoteNumber: string
  customerName: string
}

export default function DeleteLeadButton({ quoteNumber, customerName }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const res = await fetch(`/api/leads/${quoteNumber}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? d.message ?? 'Deletion failed.')
      return
    }
    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 1000)
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-sm text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
      >
        Delete Lead
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Delete this lead?</h2>
            {success ? (
              <p className="text-sm text-green-600 dark:text-green-400">Lead deleted successfully. Redirecting…</p>
            ) : (
              <>
                <p className="text-sm text-[#374151] dark:text-[#CBD5E1] mb-1">
                  This will permanently delete the lead for <strong>{customerName}</strong> — <strong>{quoteNumber}</strong>.
                </p>
                <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-5">This action cannot be undone.</p>
                {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Delete permanently'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
