import Anthropic from '@anthropic-ai/sdk'

export interface QuoteValidationResult {
  valid: boolean
  confidence: 'high' | 'low'
  mismatch_reason: string | null
  extracted_name: string | null
  extracted_address: string | null
  extracted_quote_number: string | null
}

export async function validateQuotePdf(
  pdfBase64: string,
  lead: { customer_name: string; property_address: string; quote_number: string }
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
              text: `You are validating that a quote PDF belongs to the correct customer and job.

Extract the following from this quote PDF:
1. Customer name
2. Property address
3. Quote number or reference number

Then compare them to:
- Expected customer name: ${lead.customer_name}
- Expected property address: ${lead.property_address}
- Expected quote number: ${lead.quote_number}

Return ONLY a valid JSON object with exactly these fields:
{
  "valid": true or false,
  "confidence": "high" or "low",
  "mismatch_reason": null or a short plain-English description of what does not match,
  "extracted_name": the name found in the document or null,
  "extracted_address": the address found in the document or null,
  "extracted_quote_number": the quote number or reference found in the document or null
}

Rules:
- "valid" is true only if ALL THREE fields are a reasonable match
- "valid" is false if ANY of the three fields clearly does not match
- Allow minor formatting differences (e.g. "QU00103" vs "QU-00103", or partial addresses)
- "confidence" is "low" if the document is unclear or any field cannot be found
- If confidence is "low", set "valid" to true as a safe default
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
      extracted_quote_number: null,
    }
  }
}
