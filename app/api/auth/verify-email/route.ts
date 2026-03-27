import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/notifications'
import crypto from 'crypto'

const RATE_LIMIT_SECONDS = 60
const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function POST(request: NextRequest) {
  const { email } = await request.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })

  // Always return success to prevent email enumeration
  if (!user || !user.isActive) {
    return NextResponse.json({ success: true })
  }

  // Rate limit: one request per RATE_LIMIT_SECONDS per user
  const recent = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_SECONDS * 1000) },
    },
  })
  if (recent) {
    return NextResponse.json({ success: true }) // silently succeed to prevent timing attacks
  }

  // Clean up old tokens for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

  const token = crypto.randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  })

  const resetUrl = `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/reset-password?token=${token}`

  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl })
  } catch (err) {
    console.error('Password reset email failed:', err)
  }

  return NextResponse.json({ success: true })
}
