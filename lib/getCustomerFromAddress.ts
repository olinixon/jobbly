// NOTE: Any custom sender domain must be verified in Resend before emails will send
// successfully from that address. This requires a one-time DNS setup in both the
// Resend dashboard and the domain's DNS settings. Contact Oli to set this up.

interface CampaignEmailConfig {
  customer_from_email?: string | null;
  customer_from_name?: string | null;
}

export function getCustomerFromAddress(campaign: CampaignEmailConfig): string {
  const email = campaign.customer_from_email?.trim();
  const name = campaign.customer_from_name?.trim();

  if (email) {
    // Has a configured customer sender — use it
    return name ? `${name} <${email}>` : email;
  }

  // No campaign sender configured — fall back to the environment default
  const fallback = process.env.EMAIL_FROM;
  if (!fallback) {
    throw new Error('EMAIL_FROM environment variable is not set — cannot send customer email');
  }

  return fallback;
}
