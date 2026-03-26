import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from './auth'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/webhooks']

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
  const adminOnly = ['/campaigns', '/commission', '/audit', '/notifications', '/settings', '/users']
  const subcontractorOnly = ['/jobs']
  const adminOrClient = ['/dashboard', '/leads']

  if (adminOnly.some((p) => pathname.startsWith(p)) && role !== 'ADMIN') {
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

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
