export interface ParsedQuoteOption {
  sort_order: number;
  name: string;
  price_ex_gst: number;
  price_incl_gst: number;
  duration_minutes: number | null; // populated by matching step, not AI
  job_type_id: string | null;      // populated by matching step, not AI
}

type CampaignJobType = {
  id: string;
  name: string;
  durationMinutes: number;
  sortOrder: number;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const PARSE_PROMPT = `You are parsing a gutter cleaning quote PDF. Extract all priced job options from this document.

Return ONLY a valid JSON array. No explanation, no markdown, no code fences — just the raw JSON array.

Each element must have exactly these fields:
- "sort_order": integer, starting at 1, in the order they appear in the document
- "name": string, the job type or service name as written in the document
- "price_ex_gst": number, the price excluding GST in NZD (no $ sign, no commas)
- "price_incl_gst": number, the price including GST in NZD (no $ sign, no commas) — calculate as price_ex_gst × 1.15 if not explicitly stated

Rules:
- If only one price is found, return an array with one element
- If two prices are found, return two elements
- If three prices are found, return three elements
- Never return more than three elements
- If no prices can be found, return an empty array []
- Do not invent prices — only extract what is explicitly on the document`

interface AIRawOption {
  sort_order: number;
  name: string;
  price_ex_gst: number;
  price_incl_gst: number;
}

function matchJobTypes(
  rawOptions: AIRawOption[],
  campaignJobTypes: CampaignJobType[]
): ParsedQuoteOption[] {
  return rawOptions.map((opt) => {
    // 1. Name match (case-insensitive keyword match)
    const nameMatch = campaignJobTypes.find((jt) =>
      jt.name.toLowerCase().split(' ').some((word) =>
        word.length > 3 && opt.name.toLowerCase().includes(word)
      ) ||
      opt.name.toLowerCase().split(' ').some((word) =>
        word.length > 3 && jt.name.toLowerCase().includes(word)
      )
    )

    if (nameMatch) {
      return {
        ...opt,
        duration_minutes: nameMatch.durationMinutes,
        job_type_id: nameMatch.id,
      }
    }

    // 2. Sort order match — option 1 → job type with sortOrder 1, etc.
    const sortMatch = campaignJobTypes.find((jt) => jt.sortOrder === opt.sort_order)
    if (sortMatch) {
      return {
        ...opt,
        duration_minutes: sortMatch.durationMinutes,
        job_type_id: sortMatch.id,
      }
    }

    // 3. No match
    return {
      ...opt,
      duration_minutes: null,
      job_type_id: null,
    }
  })
}

export async function parseQuotePdf(
  pdfBase64: string,
  campaignJobTypes: CampaignJobType[]
): Promise<ParsedQuoteOption[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set — skipping quote parsing')
    return []
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
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
                text: PARSE_PROMPT,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error('Anthropic API error:', response.status, await response.text())
      return []
    }

    const data = await response.json()
    const text = data?.content?.[0]?.text ?? ''

    const rawOptions: AIRawOption[] = JSON.parse(text)

    if (!Array.isArray(rawOptions)) return []

    return matchJobTypes(rawOptions.slice(0, 3), campaignJobTypes)
  } catch (err) {
    console.error('Quote parsing failed:', err)
    return []
  }
}
