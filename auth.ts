import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { authConfig } from './auth.config'

console.log('[AUTH] auth.ts module loaded, DATABASE_URL set:', !!process.env.DATABASE_URL)

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        console.log('[AUTH] authorize called, email:', credentials?.email ?? 'MISSING')
        if (!credentials?.email || !credentials?.password) return null

        let user
        try {
          user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          })
          console.log('[AUTH] DB query result:', user ? `found user id=${user.id} isActive=${user.isActive}` : 'no user found')
        } catch (err) {
          console.error('[AUTH] DB query error:', err)
          return null
        }

        if (!user || !user.isActive) return null

        let valid
        try {
          valid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          )
          console.log('[AUTH] bcrypt compare result:', valid)
        } catch (err) {
          console.error('[AUTH] bcrypt error:', err)
          return null
        }
        if (!valid) return null

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          campaignId: user.campaignId,
        }
      },
    }),
  ],
})

declare module 'next-auth' {
  interface User {
    role: string
    campaignId: string | null
  }
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: string
      campaignId: string | null
    }
  }
}
