import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'

const INVOICE_ANALYSIS_PROMPT = `You are an invoice analyser for a New Zealand business.

Examine this invoice and return ONLY a valid JSON object in this exact format, nothing else:
{
  "gst_inclusive_total": 287.50,
  "customer_price_ex_gst": 250.00,
  "confidence": "high",
  "concern": null
}

Rules:
- "gst_inclusive_total": the total amount the customer owes INCLUDING GST. If only an ex-GST total is shown, multiply by 1.15.
- "customer_price_ex_gst": the total amount EXCLUDING GST.
- "confidence": "high" if totals are clearly readable, "low" if unclear.
- "concern": null if invoice looks normal. Set to a brief string if you notice: missing totals, inconsistent amounts, or values that don't match a typical gutter cleaning invoice. Keep concern under 120 characters.

Do not include any other text, explanation, or markdown — just the raw JSON object.`

export interface InvoiceAnalysisResult {
  gstInclusiveTotal: number | null
  concern: string | null
}

export async function analyzeInvoice(invoiceBuffer: Buffer, invoiceUrl: string): Promise<InvoiceAnalysisResult> {
  let mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' = 'application/pdf'
  if (invoiceUrl.match(/\.(jpg|jpeg)$/i)) {
    mediaType = 'image/jpeg'
  } else if (invoiceUrl.match(/\.png$/i)) {
    mediaType = 'image/png'
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: INVOICE_ANALYSIS_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: mediaType === 'application/pdf' ? 'document' : 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: invoiceBuffer.toString('base64'),
            },
          } as ContentBlockParam,
          { type: 'text', text: 'Analyse this invoice.' } as ContentBlockParam,
        ],
      },
    ],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : null
  if (!raw) return { gstInclusiveTotal: null, concern: null }

  const parsed = JSON.parse(raw)
  return {
    gstInclusiveTotal: typeof parsed.gst_inclusive_total === 'number' ? parsed.gst_inclusive_total : null,
    concern: typeof parsed.concern === 'string' && parsed.concern.length > 0 ? parsed.concern : null,
  }
}
