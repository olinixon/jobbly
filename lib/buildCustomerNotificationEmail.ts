// Shared helper for the customer job-completion notification email.
// Returns the full Resend email payload — both the complete and resend-customer-email
// endpoints import this and call resend.emails.send() with the result.

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

interface LeadInput {
  customerName: string
  propertyAddress: string
  invoiceUrl: string | null
  jobReportUrl: string | null
}

interface CampaignInput {
  clientCompanyName?: string | null
}

export interface CustomerNotificationEmailPayload {
  subject: string
  html: string
  attachments: Array<{ filename: string; content: Buffer }>
  /** Non-empty string if any PDF fetch failed — caller should append to lead notes. */
  attachmentNotes: string
}

export async function buildCustomerNotificationEmail(
  lead: LeadInput,
  campaign: CampaignInput,
  portalUrl: string
): Promise<CustomerNotificationEmailPayload> {
  const firstName = lead.customerName.trim().split(' ')[0]
  const clientCompanyName = campaign.clientCompanyName ?? 'Continuous Group'
  const today = new Date().toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const subject = `Your gutter clean is complete — ${lead.propertyAddress}`

  const html = emailShell(`
    <tr><td style="padding:40px 40px 24px;">
      <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:#18181b;">Hi ${firstName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#71717a;">Your gutter clean at <strong style="color:#18181b;">${lead.propertyAddress}</strong> is now complete.</p>
      <p style="margin:0 0 20px;font-size:15px;color:#71717a;">We hope everything went smoothly and that you're happy with the service.</p>
      <p style="margin:0 0 20px;font-size:15px;color:#71717a;">Your invoice and job report are attached to this email for your records.</p>
      <p style="margin:0 0 24px;font-size:15px;color:#71717a;">You can also view them online and pay your invoice securely by clicking the button below.</p>
      <div style="margin-bottom:24px;">${primaryButton(portalUrl, 'View Documents &amp; Pay Invoice')}</div>
      <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;">Clicking the button takes you to a secure page where you can:</p>
      <ul style="margin:0 0 24px;padding-left:20px;font-size:13px;color:#a1a1aa;">
        <li style="margin-bottom:4px;">View and download your invoice</li>
        <li style="margin-bottom:4px;">View and download your job report</li>
        <li>Pay your invoice online via Stripe</li>
      </ul>
      <p style="margin:0 0 20px;font-size:14px;color:#71717a;">If you have any questions about the work carried out or your invoice, please don't hesitate to get in touch.</p>
      <p style="margin:0 0 6px;font-size:14px;color:#71717a;">Thank you for choosing <strong style="color:#18181b;">${clientCompanyName}</strong>. We look forward to helping you again in the future.</p>
      <p style="margin:16px 0 4px;font-size:14px;color:#71717a;">Warm regards,</p>
      <p style="margin:0;font-size:14px;color:#71717a;">The ${clientCompanyName} Team</p>
    </td></tr>
  `)

  // Fetch PDFs from R2 and build attachments
  const attachments: Array<{ filename: string; content: Buffer }> = []
  const errorParts: string[] = []

  if (lead.invoiceUrl) {
    try {
      const res = await fetch(lead.invoiceUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      attachments.push({
        filename: lead.invoiceUrl.split('/').pop() ?? 'invoice.pdf',
        content: Buffer.from(await res.arrayBuffer()),
      })
    } catch (err) {
      console.error('Failed to fetch invoice for email attachment:', err)
      errorParts.push(
        `\n[Attachment Error — ${today}] Failed to attach invoice to customer email. File may still be accessible via the portal link.`
      )
    }
  }

  if (lead.jobReportUrl) {
    try {
      const res = await fetch(lead.jobReportUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      attachments.push({
        filename: lead.jobReportUrl.split('/').pop() ?? 'job-report.pdf',
        content: Buffer.from(await res.arrayBuffer()),
      })
    } catch (err) {
      console.error('Failed to fetch job report for email attachment:', err)
      errorParts.push(
        `\n[Attachment Error — ${today}] Failed to attach job report to customer email. File may still be accessible via the portal link.`
      )
    }
  }

  return {
    subject,
    html,
    attachments,
    attachmentNotes: errorParts.join(''),
  }
}
