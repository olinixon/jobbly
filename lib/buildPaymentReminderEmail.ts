// Day 5 payment reminder email — sent to customers who haven't paid 5 days after job completion.
// Returns the full Resend email payload including PDF attachments fetched from R2.

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
  return `<a href="${href}" style="display:block;width:100%;background:#18181b;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;text-align:center;box-sizing:border-box;">${label}</a>`
}

interface LeadInput {
  customerName: string
  propertyAddress: string
  invoiceUrl: string | null
  jobReportUrl: string | null
  customerPortalToken: string | null
}

interface CampaignInput {
  clientCompanyName?: string | null
}

export interface PaymentReminderEmailPayload {
  subject: string
  html: string
  attachments: Array<{ filename: string; content: Buffer }>
  /** Non-empty string if any PDF fetch failed — caller should append to lead notes. */
  attachmentNotes: string
}

export async function buildPaymentReminderEmail(
  lead: LeadInput,
  campaign: CampaignInput,
  portalUrl: string
): Promise<PaymentReminderEmailPayload> {
  const firstName = lead.customerName.trim().split(' ')[0]
  const clientCompanyName = campaign.clientCompanyName ?? 'Continuous Group'
  const today = new Date().toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const subject = `Friendly reminder — your invoice is ready to pay`

  const html = emailShell(`
    <tr><td style="padding:40px 40px 24px;">
      <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:#18181b;">Hi ${firstName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#71717a;">Just a friendly reminder that your invoice for the gutter clean at <strong style="color:#18181b;">${lead.propertyAddress}</strong> is still outstanding.</p>
      <p style="margin:0 0 24px;font-size:15px;color:#71717a;">Your invoice and job report are attached to this email again for your reference. You can pay securely online by clicking the button below.</p>
      <div style="margin-bottom:12px;">${primaryButton(portalUrl, 'View Invoice &amp; Pay Now')}</div>
      <p style="margin:0 0 24px;font-size:12px;color:#a1a1aa;text-align:center;">Paid securely through Stripe.</p>
      <p style="margin:0 0 20px;font-size:14px;color:#71717a;">If you&apos;ve already arranged payment, please disregard this email. If you have any questions, please don&apos;t hesitate to get in touch.</p>
      <p style="margin:0 0 6px;font-size:14px;color:#71717a;">Thank you,</p>
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
      console.error('Failed to fetch invoice for payment reminder attachment:', err)
      errorParts.push(
        `\n[Attachment Error — ${today}] Failed to attach invoice to Day 5 payment reminder.`
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
      console.error('Failed to fetch job report for payment reminder attachment:', err)
      errorParts.push(
        `\n[Attachment Error — ${today}] Failed to attach job report to Day 5 payment reminder.`
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
