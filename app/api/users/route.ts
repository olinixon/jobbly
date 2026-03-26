import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
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
  })
  return NextResponse.json(users)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const plainPassword: string = body.password

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(plainPassword, 12),
      role: body.role,
      campaignId: body.campaignId ?? null,
      isActive: true,
    },
  })

  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: user.email,
      subject: "You've been invited to Jobbly",
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
            <tr><td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
                <tr><td style="background:#18181b;padding:28px 40px;">
                  <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Jobbly</div>
                  <div style="font-size:12px;color:#a1a1aa;margin-top:2px;">by Omniside AI</div>
                </td></tr>
                <tr><td style="padding:40px;">
                  <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;">You've been invited</h1>
                  <p style="margin:0 0 24px;color:#71717a;font-size:15px;">Hi ${user.name}, you've been added to Jobbly by Omniside AI. Here are your login details.</p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e4e4e7;border-radius:8px;margin-bottom:28px;">
                    <tr><td style="padding:24px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:6px 0;font-size:13px;color:#71717a;width:140px;">Login page</td>
                          <td style="padding:6px 0;font-size:13px;color:#18181b;font-weight:500;">${appUrl}/login</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;font-size:13px;color:#71717a;">Email</td>
                          <td style="padding:6px 0;font-size:13px;color:#18181b;font-weight:500;">${user.email}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;font-size:13px;color:#71717a;">Temporary password</td>
                          <td style="padding:6px 0;font-size:13px;color:#18181b;font-weight:500;font-family:monospace;">${plainPassword}</td>
                        </tr>
                      </table>
                    </td></tr>
                  </table>
                  <p style="margin:0 0 24px;color:#71717a;font-size:14px;">Once you're logged in, go to your profile page to change your password.</p>
                  <a href="${appUrl}/login" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">Log in to Jobbly</a>
                </td></tr>
                <tr><td style="padding:20px 40px;border-top:1px solid #f4f4f5;text-align:center;">
                  <p style="margin:0;font-size:12px;color:#a1a1aa;">Jobbly by Omniside AI</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    })
    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email, role: user.role, success: true, message: 'User created and welcome email sent.' },
      { status: 201 }
    )
  } catch (err) {
    console.error('Welcome email failed:', err)
    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email, role: user.role, success: true, warning: 'User created but welcome email failed to send.' },
      { status: 201 }
    )
  }
}
