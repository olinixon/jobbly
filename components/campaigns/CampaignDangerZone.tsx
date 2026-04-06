'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

interface Props {
  campaignId: string
}

export default function CampaignDangerZone({ campaignId }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [deactivating, setDeactivating] = useState(false)

  async function deactivate() {
    setDeactivating(true)
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    setDeactivating(false)
    setShowModal(false)
    router.refresh()
  }

  return (
    <>
      {showModal && (
        <Modal title="Deactivate Campaign?" onClose={() => setShowModal(false)}>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
            This will set the campaign status to <strong>Completed</strong>. No new leads will be accepted. You can reactivate it from Campaign Status at any time.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={deactivate} disabled={deactivating}>
              {deactivating ? 'Deactivating…' : 'Deactivate Campaign'}
            </Button>
          </div>
        </Modal>
      )}

      <section className="bg-white dark:bg-[#1E293B] border border-[#DC2626]/30 rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-[#DC2626] mb-2">Danger Zone</h2>
        <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-4">
          Deactivating the campaign sets its status to Completed and stops new leads from being accepted.
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors"
        >
          Deactivate Campaign
        </button>
      </section>
    </>
  )
}
