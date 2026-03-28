import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = () => process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

const EMAIL_STYLES = `
  body{margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  a{color:inherit;text-decoration:none;}
`

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${EMAIL_STYLES}</style></head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <tr><td style="background:#18181b;padding:24px 40px;">
        <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Jobbly</div>
        <div style="font-size:12px;color:#a1a1aa;margin-top:2px;">by Omniside AI</div>
      </td></tr>
      ${content}
      <tr><td style="padding:20px 40px;border-top:1px solid #f4f4f5;text-align:center;">
        <p style="margin:0;font-size:12px;color:#a1a1aa;">Jobbly by Omniside AI</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

function primaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">${label}</a>`
}

function secondaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#ffffff;color:#18181b;text-decoration:none;padding:11px 27px;border-radius:8px;font-size:15px;font-weight:600;border:1px solid #18181b;">${label}</a>`
}

function card(content: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e4e4e7;border-radius:8px;margin-bottom:24px;"><tr><td style="padding:24px;">${content}</td></tr></table>`
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:5px 0;font-size:13px;color:#71717a;width:160px;">${label}</td><td style="padding:5px 0;font-size:13px;color:#18181b;font-weight:500;">${value}</td></tr>`
}

function statRow(label: string, value: string): string {
  return `<td style="text-align:center;padding:0 12px;"><div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${label}</div><div style="font-size:15px;font-weight:600;color:#18181b;">${value}</div></td>`
}

// ─── New Lead Email ──────────────────────────────────────────────────────────

interface NewLeadEmailParams {
  to: string | string[]
  quoteNumber: string
  customerName: string
  customerPhone: string
  propertyAddress: string
  googleMapsUrl: string
  propertyPerimeterM?: number | null
  propertyAreaM2?: number | null
  propertyStoreys?: number | null
}

export async function sendNewLeadEmail(params: NewLeadEmailParams) {
  const appUrl = APP_URL()
  const jobUrl = `${appUrl}/jobs/${params.quoteNumber}`

  const html = emailShell(`
    <tr><td style="padding:40px 40px 24px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">New job lead</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#71717a;">A new lead has come in from the AI campaign.</p>
      ${card(`
        <div style="font-size:22px;font-weight:700;color:#2563eb;margin-bottom:2px;">${params.quoteNumber}</div>
        <div style="font-size:18px;font-weight:600;color:#18181b;margin-bottom:16px;">${params.customerName}</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row('Phone', `<a href="tel:${params.customerPhone}" style="color:#2563eb;">${params.customerPhone}</a>`)}
          ${row('Address', params.propertyAddress)}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-top:1px solid #e4e4e7;padding-top:16px;">
          <tr>
            ${statRow('Perimeter', params.propertyPerimeterM ? `${params.propertyPerimeterM}m` : 'N/A')}
            ${statRow('Area', params.propertyAreaM2 ? `${params.propertyAreaM2}m²` : 'N/A')}
            ${statRow('Storeys', params.propertyStoreys != null ? String(params.propertyStoreys) : 'N/A')}
          </tr>
        </table>
      `)}
      <div style="margin-bottom:12px;">${primaryButton(jobUrl, 'View Job in Jobbly')}</div>
      <div>${secondaryButton(params.googleMapsUrl, 'Open in Google Maps')}</div>
    </td></tr>
  `)

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: params.to,
    subject: `New job — ${params.quoteNumber} — ${params.customerName}`,
    html,
  })
}

// ─── Password Reset Email ─────────────────────────────────────────────────────

interface PasswordResetEmailParams {
  to: string
  name: string
  resetUrl: string
}

export async function sendPasswordResetEmail(params: PasswordResetEmailParams) {
  const html = emailShell(`
    <tr><td style="padding:40px 40px 24px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#71717a;">Hi ${params.name}, we received a request to reset your Jobbly password. Click the button below to choose a new one.</p>
      <div style="margin-bottom:24px;">${primaryButton(params.resetUrl, 'Reset Password')}</div>
      <p style="margin:0;font-size:13px;color:#a1a1aa;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    </td></tr>
  `)

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: params.to,
    subject: 'Reset your Jobbly password',
    html,
  })
}

// ─── Job Completed Email ─────────────────────────────────────────────────────

interface JobCompletedEmailParams {
  to: string | string[]
  quoteNumber: string
  customerName: string
  propertyAddress: string
  contractorRate?: number | null
  customerPrice?: number | null
  omnisideCommission?: number | null
}

export async function sendJobCompletedEmail(params: JobCompletedEmailParams) {
  const appUrl = APP_URL()
  const fmt = (n?: number | null) => (n != null ? `$${n.toFixed(2)}` : 'TBC')

  const html = emailShell(`
    <tr><td style="padding:40px 40px 24px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">Job completed</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#71717a;">A job has been marked as completed and an invoice has been attached.</p>
      ${card(`
        <div style="font-size:22px;font-weight:700;color:#2563eb;margin-bottom:2px;">${params.quoteNumber}</div>
        <div style="font-size:18px;font-weight:600;color:#18181b;margin-bottom:16px;">${params.customerName}</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row('Address', params.propertyAddress)}
          ${row('Contractor rate', fmt(params.contractorRate))}
          ${row('Customer price', fmt(params.customerPrice))}
          ${row('Commission', fmt(params.omnisideCommission))}
        </table>
      `)}
      <p style="margin:0 0 20px;font-size:14px;color:#71717a;">Log in to Jobbly to verify and mark this commission as reconciled.</p>
      ${primaryButton(`${appUrl}/leads/${params.quoteNumber}`, 'View Lead in Jobbly')}
    </td></tr>
  `)

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: params.to,
    subject: `Job completed — ${params.quoteNumber} — ${params.customerName}`,
    html,
  })
}

// ─── Quote Email (initial) ────────────────────────────────────────────────────

interface QuoteEmailParams {
  to: string
  customerName: string
  propertyAddress: string
  quoteNumber: string
  customerPrice: number | null
  bookingToken: string
  pdfBuffer?: Buffer
  pdfFileName?: string
}

function buildQuoteHtml(params: QuoteEmailParams, intro: string, heading: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const bookingUrl = `${appUrl}/book/${params.bookingToken}`
  const exGst = params.customerPrice ?? 0
  const inclGst = exGst * 1.15

  return emailShell(`
    <tr><td style="padding:40px 40px 24px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">${heading}</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#71717a;">${intro}</p>
      ${card(`
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row('Property', params.propertyAddress)}
          ${row('Quote number', params.quoteNumber)}
          ${row('Price', `$${exGst.toFixed(2)} + GST = $${inclGst.toFixed(2)} incl. GST`)}
        </table>
      `)}
      <p style="margin:0 0 20px;font-size:14px;color:#71717a;">To book your job, click the link below and choose a time that suits you:</p>
      <div style="margin-bottom:24px;">${primaryButton(bookingUrl, 'BOOK NOW')}</div>
      <p style="margin:0;font-size:13px;color:#a1a1aa;">This quote is valid for 30 days. If you have any questions, please don't hesitate to get in touch.</p>
    </td></tr>
  `)
}

export async function sendQuoteEmail(params: QuoteEmailParams) {
  const html = buildQuoteHtml(
    params,
    `Hi ${params.customerName}, thank you for your interest in our gutter cleaning service. Please find your quote attached.`,
    'Your gutter cleaning quote'
  )

  const payload: Parameters<typeof resend.emails.send>[0] = {
    from: process.env.EMAIL_FROM!,
    to: params.to,
    subject: `Your gutter cleaning quote — ${params.propertyAddress}`,
    html,
  }

  if (params.pdfBuffer) {
    payload.attachments = [{ filename: params.pdfFileName ?? 'quote.pdf', content: params.pdfBuffer }]
  }

  await resend.emails.send(payload)
}

// ─── Missing Email Alert ──────────────────────────────────────────────────────

interface MissingEmailAlertParams {
  quoteNumber: string
  customerName: string
  propertyAddress: string
}

export async function sendMissingEmailAlert(params: MissingEmailAlertParams) {
  const html = emailShell(`
    <tr><td style="padding:40px 40px 24px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#dc2626;">Action required — customer email missing</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#71717a;">The lead below was received without a customer email address. The quote has been uploaded but the email could not be sent. Please obtain the customer's email address and send manually.</p>
      ${card(`
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row('Quote number', params.quoteNumber)}
          ${row('Customer', params.customerName)}
          ${row('Property', params.propertyAddress)}
        </table>
      `)}
    </td></tr>
  `)

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: process.env.EMAIL_OLI!,
    subject: `Action required — customer email missing — ${params.quoteNumber}`,
    html,
  })
}

// ─── Booking Confirmation (to customer) ──────────────────────────────────────

interface BookingConfirmationParams {
  to: string
  customerName: string
  propertyAddress: string
  quoteNumber: string
  jobTypeName: string
  bookingDate: string    // e.g. "Wednesday 5 April 2026"
  windowStart: string    // e.g. "7:00am"
  windowEnd: string      // e.g. "9:00am"
}

export async function sendBookingConfirmationCustomer(params: BookingConfirmationParams) {
  const html = emailShell(`
    <tr><td style="padding:40px 40px 24px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">Booking confirmed</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#71717a;">Hi ${params.customerName}, your gutter cleaning has been booked.</p>
      ${card(`
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row('Property', params.propertyAddress)}
          ${row('Date', params.bookingDate)}
          ${row('Time', `${params.windowStart} – ${params.windowEnd}`)}
          ${row('Job type', params.jobTypeName)}
          ${row('Quote number', params.quoteNumber)}
        </table>
      `)}
      <p style="margin:0;font-size:13px;color:#a1a1aa;">We'll see you then. If you need to make any changes, please contact us.</p>
    </td></tr>
  `)

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: params.to,
    subject: `Booking confirmed — ${params.propertyAddress}`,
    html,
  })
}

// ─── Booking Notification (to subcontractor/PWB) ─────────────────────────────

interface BookingNotificationParams {
  to: string | string[]
  quoteNumber: string
  customerName: string
  propertyAddress: string
  googleMapsUrl: string
  jobTypeName: string
  bookingDate: string
  windowStart: string
  windowEnd: string
}

export async function sendBookingNotificationPWB(params: BookingNotificationParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const jobUrl = `${appUrl}/jobs/${params.quoteNumber}`

  const html = emailShell(`
    <tr><td style="padding:40px 40px 24px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">New job booked</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#71717a;">A customer has booked a job.</p>
      ${card(`
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row('Quote number', params.quoteNumber)}
          ${row('Customer', params.customerName)}
          ${row('Property', params.propertyAddress)}
          ${row('Job type', params.jobTypeName)}
          ${row('Date', params.bookingDate)}
          ${row('Time', `${params.windowStart} – ${params.windowEnd}`)}
        </table>
      `)}
      <div style="margin-bottom:12px;">${primaryButton(jobUrl, 'View Job in Jobbly')}</div>
      <div>${secondaryButton(params.googleMapsUrl, 'Open in Google Maps')}</div>
    </td></tr>
  `)

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: params.to,
    subject: `New job booked — ${params.quoteNumber} — ${params.customerName}`,
    html,
  })
}
