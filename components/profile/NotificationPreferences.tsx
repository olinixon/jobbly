'use client'

import { useState } from 'react'

interface NotificationPreferencesProps {
  role: string
  notifyNewLead: boolean
  notifyJobCompleted: boolean
}

export default function NotificationPreferences({ role, notifyNewLead, notifyJobCompleted }: NotificationPreferencesProps) {
  const [newLeadEnabled, setNewLeadEnabled] = useState(notifyNewLead)
  const [jobCompletedEnabled, setJobCompletedEnabled] = useState(notifyJobCompleted)
  const [saved, setSaved] = useState(false)

  if (role === 'CLIENT') return null

  async function toggle(field: 'notifyNewLead' | 'notifyJobCompleted', value: boolean) {
    if (field === 'notifyNewLead') setNewLeadEnabled(value)
    else setJobCompletedEnabled(value)

    await fetch('/api/profile/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
      <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-1">Notification Preferences</h2>
      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-5">Control which emails Jobbly sends you.</p>

      <div className="space-y-4">
        {role === 'SUBCONTRACTOR' && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">New lead notifications</p>
              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5">Email me when a new job lead is assigned to my campaign.</p>
            </div>
            <button
              role="switch"
              aria-checked={newLeadEnabled}
              onClick={() => toggle('notifyNewLead', !newLeadEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 ${newLeadEnabled ? 'bg-[#2563EB]' : 'bg-[#D1D5DB] dark:bg-[#334155]'}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${newLeadEnabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        )}

        {role === 'ADMIN' && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">Job completion notifications</p>
              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5">Email me when a job is marked completed and an invoice is attached.</p>
            </div>
            <button
              role="switch"
              aria-checked={jobCompletedEnabled}
              onClick={() => toggle('notifyJobCompleted', !jobCompletedEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 ${jobCompletedEnabled ? 'bg-[#2563EB]' : 'bg-[#D1D5DB] dark:bg-[#334155]'}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${jobCompletedEnabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        )}
      </div>

      {saved && (
        <p className="mt-3 text-sm text-[#16A34A] transition-opacity">Preferences saved.</p>
      )}
    </div>
  )
}
