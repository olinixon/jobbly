import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'
import PageHeader from '@/components/layout/PageHeader'
import UsersTable from '@/components/users/UsersTable'
import EmptyState from '@/components/ui/EmptyState'

export default async function UsersPage() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const [users, campaigns] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        campaignId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        campaign: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.campaign.findMany({ select: { id: true, name: true } }),
  ])

  return (
    <AppShell>
      <PageHeader title="User Management" subtitle="Create and manage user accounts" />

      {users.length === 0 ? (
        <EmptyState message="No users yet." />
      ) : (
        <UsersTable users={users} campaigns={campaigns} currentUserId={session.user.id} />
      )}
    </AppShell>
  )
}
