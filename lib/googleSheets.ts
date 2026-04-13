import { SignJWT, importPKCS8 } from 'jose'

const SHEET_ID = '1khKKXD3DuFTJxRuL5tlv3gFhSiZCl8VCmCnSbdptip4'
const SHEET_RANGE = 'Sheet1!A:F'
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly'

export interface CallStats {
  totalCalls: number
  answered: number
  notInterested: number
  transferAttempted: number
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!
  const privateKeyPem = Buffer.from(
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64 || '',
    'base64'
  ).toString('utf-8')

  const privateKey = await importPKCS8(privateKeyPem, 'RS256')

  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({
    scope: SCOPES,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[CallStats] OAuth token error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return data.access_token as string
}

export async function getCallStats(from?: Date, to?: Date): Promise<CallStats> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64) {
    throw new Error('Google Sheets credentials not configured')
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (err) {
    console.error('[CallStats] Auth error:', err)
    throw err
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}`

  let sheetsRes: Response
  try {
    sheetsRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (err) {
    console.error('[CallStats] Sheets fetch error:', err)
    throw err
  }

  if (!sheetsRes.ok) {
    const body = await sheetsRes.text()
    console.error(`[CallStats] Sheets API error ${sheetsRes.status}:`, body)
    throw new Error(`Sheets API error ${sheetsRes.status}`)
  }

  const json = await sheetsRes.json()
  const rows: string[][] = json.values ?? []

  // Skip header row (index 0), filter to rows with a non-empty Lead ID
  let dataRows = rows.slice(1).filter(row => row[0] && String(row[0]).trim() !== '')

  // Apply date range filter if provided — uses column C (index 2), ISO 8601 timestamp
  if (from || to) {
    dataRows = dataRows.filter(row => {
      const rawDate = row[2]
      if (!rawDate) return false
      const callDate = new Date(rawDate)
      if (isNaN(callDate.getTime())) return false
      if (from && callDate < from) return false
      if (to && callDate > to) return false
      return true
    })
  }

  const totalCalls = dataRows.length
  const answered = dataRows.filter(row => row[3] === 'TRUE').length
  const notInterested = dataRows.filter(row => row[4] === 'TRUE').length
  const transferAttempted = dataRows.filter(row => row[5] === 'TRUE').length

  return { totalCalls, answered, notInterested, transferAttempted }
}
