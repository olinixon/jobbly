'use client'

import { useState } from 'react'
import type { CalendarLinks } from '@/lib/generateCalendarLinks'

export default function AddToCalendarDropdown({ links }: { links: CalendarLinks }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-[#2563EB] dark:text-[#3B82F6] hover:underline"
      >
        Add to Calendar ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
            <a
              href={links.google}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A]"
            >
              Google Calendar
            </a>
            <a
              href={links.apple_ics}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A]"
            >
              Apple Calendar
            </a>
            <a
              href={links.outlook}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A]"
            >
              Outlook
            </a>
          </div>
        </>
      )}
    </div>
  )
}
