import { cookies } from 'next/headers'

/**
 * Returns the active campaign ID for the current user.
 * For non-ADMIN roles, reads from session directly.
 * For ADMIN, falls back to the cookie set when entering a campaign via the dashboard.
 */
export async function getActiveCampaignId(
  sessionCampaignId: string | null | undefined,
  role: string
): Promise<string | null> {
  if (sessionCampaignId) return sessionCampaignId
  if (role !== 'ADMIN') return null
  const cookieStore = await cookies()
  return cookieStore.get('jobbly_campaign_id')?.value ?? null
}
