import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import CalendarClient from '@/components/calendar/CalendarClient'

export const revalidate = 30

export default async function CalendarPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F1F5F9]">Calendar</h1>
      </div>
      <CalendarClient />
    </AppShell>
  )
}
