import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reminder_day, auto_send } = await request.json()

  if (reminder_day !== null && (typeof reminder_day !== 'number' || reminder_day < 1 || reminder_day > 28)) {
    return NextResponse.json({ error: 'reminder_day must be between 1 and 28, or null.' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      invoice_reminder_day: reminder_day ?? null,
      invoice_auto_send: typeof auto_send === 'boolean' ? auto_send : undefined,
    },
  })

  return NextResponse.json({ ok: true })
}
