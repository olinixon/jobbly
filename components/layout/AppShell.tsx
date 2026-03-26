import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Sidebar from './Sidebar'
import Footer from './Footer'
import ThemeToggle from './ThemeToggle'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A]">
      <Sidebar role={session.user.role} userName={session.user.name} />
      <div className="flex-1 flex flex-col md:ml-56">
        <div className="flex justify-end p-4">
          <ThemeToggle />
        </div>
        <main className="flex-1 px-6 pb-6">{children}</main>
        <Footer />
      </div>
    </div>
  )
}
