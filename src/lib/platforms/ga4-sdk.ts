/**
 * GA4 Data API SDK wrapper.
 *
 * OAuth2Client auto-refreshes access tokens using the stored refresh_token,
 * so callers don't need manual token-refresh logic (see Task 17 — removed
 * maybeRefreshGoogleToken once all Google SDKs moved here).
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';

export function ga4Client(
  accessToken: string,
  refreshToken?: string | null,
): BetaAnalyticsDataClient {
  const oauth = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });
  oauth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken ?? undefined,
  });
  // BetaAnalyticsDataClient types accept GoogleAuth, but OAuth2Client
  // satisfies the same AuthClient shape at runtime — this is the pattern
  // google-auth-library docs recommend for user-delegated OAuth flows.
  const auth = new GoogleAuth({ authClient: oauth });
  return new BetaAnalyticsDataClient({ auth });
}
