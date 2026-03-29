import Anthropic from '@anthropic-ai/sdk'

export interface QuoteValidationResult {
  valid: boolean
  confidence: 'high' | 'low'
  mismatch_reason: string | null
  extracted_name: string | null
  extracted_address: string | null
}

export async function validateQuotePdf(
  pdfBase64: string,
  lead: { customer_name: string; property_address: string }
): Promise<QuoteValidationResult> {
  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: `You are validating that a quote PDF belongs to the correct customer.

Extract the customer name and property address from this quote PDF.

Then compare them to:
- Expected customer name: ${lead.customer_name}
- Expected property address: ${lead.property_address}

Return ONLY a valid JSON object with exactly these fields:
{
  "valid": true or false,
  "confidence": "high" or "low",
  "mismatch_reason": null or a short plain-English explanation of what doesn't match,
  "extracted_name": the name you found in the document or null,
  "extracted_address": the address you found in the document or null
}

Rules:
- "valid" is true if the name and address are a reasonable match (allow for minor formatting differences, abbreviations, or partial addresses)
- "valid" is false if the name is clearly different or the address is clearly a different property
- "confidence" is "low" if the document doesn't clearly show a customer name or address, or if you are unsure
- If confidence is "low", set "valid" to true as a safe default — do not block uploads when you cannot read the document clearly
- Never return more than one JSON object`,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    const parsed = JSON.parse(jsonMatch[0]) as QuoteValidationResult
    return parsed
  } catch (err) {
    console.error('validateQuotePdf error:', err)
    // On any failure, pass through — never block upload due to API error
    return {
      valid: true,
      confidence: 'low',
      mismatch_reason: null,
      extracted_name: null,
      extracted_address: null,
    }
  }
}
