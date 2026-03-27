import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

// Edge-safe auth instance — no Prisma, reads JWT only
const { auth } = NextAuth(authConfig)

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/api/auth', '/api/webhooks']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow Next.js internals and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/'
  ) {
    return NextResponse.next()
  }

  const session = await auth()

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = session.user.role

  // Role-based route protection
  // /commission — admin + client (client sees margin summary, admin sees reconciliation)
  const adminOnly = ['/campaigns', '/settings', '/users']
  const adminOrClientCommission = ['/commission']
  const subcontractorOnly = ['/jobs']
  const adminOrClient = ['/leads']
  const adminOrSub = ['/needs-action']
  // /dashboard, /notifications, /audit — all authenticated roles

  if (adminOnly.some((p) => pathname.startsWith(p)) && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (adminOrClientCommission.some((p) => pathname.startsWith(p)) && role !== 'ADMIN' && role !== 'CLIENT') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (subcontractorOnly.some((p) => pathname.startsWith(p)) && role !== 'SUBCONTRACTOR') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (
    adminOrClient.some((p) => pathname.startsWith(p)) &&
    role !== 'ADMIN' &&
    role !== 'CLIENT'
  ) {
    return NextResponse.redirect(new URL('/jobs', request.url))
  }

  if (adminOrSub.some((p) => pathname.startsWith(p)) && role !== 'ADMIN' && role !== 'SUBCONTRACTOR') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Persist selected campaign ID to cookie for admin users
  // When admin clicks "Enter Campaign", they land on /dashboard?campaignId=xxx
  // This cookie makes the campaignId available to pages that don't have the URL param
  const response = NextResponse.next()
  const campaignIdParam = request.nextUrl.searchParams.get('campaignId')
  if (campaignIdParam && role === 'ADMIN') {
    response.cookies.set('jobbly_campaign_id', campaignIdParam, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
