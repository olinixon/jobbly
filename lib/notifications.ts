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
