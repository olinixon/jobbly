import { sheets, auth as googleAuth } from '@googleapis/sheets'

const SHEET_ID = '1khKKXD3DuFTJxRuL5tlv3gFhSiZCl8VCmCnSbdptip4'
const SHEET_RANGE = 'Sheet1!A:F' // update tab name if different

export interface CallStats {
  totalCalls: number
  answered: number
  notInterested: number
  transferAttempted: number
}

export async function getCallStats(from?: Date, to?: Date): Promise<CallStats> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error('Google Sheets credentials not configured')
  }

  const authClient = new googleAuth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const client = sheets({ version: 'v4', auth: authClient })

  const response = await client.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
  })

  const rows = response.data.values ?? []

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
