import type { NextAuthConfig } from 'next-auth'

// Lightweight auth config — no Prisma, no native addons — safe for Edge/middleware
export const authConfig: NextAuthConfig = {
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role
        token.campaignId = (user as { campaignId: string | null }).campaignId
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.campaignId = token.campaignId as string | null
      }
      return session
    },
  },
}
