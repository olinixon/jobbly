import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCallStats } from '@/lib/googleSheets'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await auth()

  // Only ADMIN and CLIENT can see call stats
  if (!session || session.user.role === 'SUBCONTRACTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  const from = fromParam ? new Date(fromParam) : undefined
  const to = toParam ? new Date(toParam) : undefined

  try {
    const stats = await getCallStats(from, to)
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Failed to fetch call stats from Google Sheets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch call stats' },
      { status: 500 }
    )
  }
}
