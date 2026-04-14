'use client'

import { useState } from 'react'

export default function SandboxBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 text-amber-800 dark:text-amber-200 text-sm">
      <span>
        <strong>Sandbox active.</strong> A test lead is visible below. Emails are redirected to Oli. Payments are suppressed.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 font-medium"
      >
        Dismiss
      </button>
    </div>
  )
}
