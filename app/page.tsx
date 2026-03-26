import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export default async function HomePage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role === 'ADMIN') redirect('/campaigns')
  if (session.user.role === 'CLIENT') redirect('/dashboard')
  redirect('/jobs')
}
