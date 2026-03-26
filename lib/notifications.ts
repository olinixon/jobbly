import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface NewLeadEmailParams {
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
  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const body = `Hi Frank,

A new lead has come in from the AI campaign. Here are the details:

Quote number: ${params.quoteNumber}
Customer name: ${params.customerName}
Phone: ${params.customerPhone}
Property address: ${params.propertyAddress}
Google Maps: ${params.googleMapsUrl}
Property perimeter: ${params.propertyPerimeterM ? `${params.propertyPerimeterM}m` : 'N/A'}
Property area: ${params.propertyAreaM2 ? `${params.propertyAreaM2}m²` : 'N/A'}
Storeys: ${params.propertyStoreys ?? 'N/A'}

Please log in to Jobbly to view the full details and update the status as the job progresses.

${appUrl}/jobs/${params.quoteNumber}

Jobbly by Omniside AI`

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: process.env.EMAIL_FRANK!,
    subject: `New job lead — ${params.quoteNumber} — ${params.customerName}`,
    text: body,
  })
}

interface JobCompletedEmailParams {
  quoteNumber: string
  customerName: string
  propertyAddress: string
  contractorRate?: number | null
  customerPrice?: number | null
  omnisideCommission?: number | null
}

export async function sendJobCompletedEmail(params: JobCompletedEmailParams) {
  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const fmt = (n?: number | null) => (n != null ? `$${n.toFixed(2)}` : 'TBC')

  const body = `Hi Oli,

A job has been marked as completed and an invoice has been attached.

Quote number: ${params.quoteNumber}
Customer name: ${params.customerName}
Property address: ${params.propertyAddress}
Contractor rate: ${fmt(params.contractorRate)}
Customer price: ${fmt(params.customerPrice)}
Omniside commission: ${fmt(params.omnisideCommission)}

Log in to Jobbly to verify and mark this commission as reconciled.

${appUrl}/leads/${params.quoteNumber}

Jobbly by Omniside AI`

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: process.env.EMAIL_OLI!,
    subject: `Job completed — ${params.quoteNumber} — ${params.customerName}`,
    text: body,
  })
}
