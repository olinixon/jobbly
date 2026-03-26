import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/Badge'
import PasswordChangeForm from '@/components/profile/PasswordChangeForm'

export default async function ProfilePage() {
  const session = await auth()
  if (!session) redirect('/login')

  const campaignName =
    session.user.role === 'ADMIN'
      ? 'All campaigns'
      : session.user.campaignId
        ? (await prisma.campaign.findUnique({ where: { id: session.user.campaignId }, select: { name: true } }))?.name ?? '—'
        : '—'

  return (
    <AppShell>
      <PageHeader title="My Profile" />

      <div className="max-w-lg mx-auto space-y-6">
        {/* Account Details */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-4">Account Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#6B7280] dark:text-[#94A3B8]">Full name</dt>
              <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{session.user.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#6B7280] dark:text-[#94A3B8]">Email</dt>
              <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{session.user.email}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-[#6B7280] dark:text-[#94A3B8]">Role</dt>
              <dd><Badge status={session.user.role} type="role" /></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#6B7280] dark:text-[#94A3B8]">Campaign</dt>
              <dd className="font-medium text-[#111827] dark:text-[#F1F5F9]">{campaignName}</dd>
            </div>
          </dl>
        </div>

        {/* Change Password */}
        <PasswordChangeForm />
      </div>
    </AppShell>
  )
}
