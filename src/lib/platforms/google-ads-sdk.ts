/**
 * Google Ads API SDK wrapper.
 *
 * Requires GOOGLE_ADS_DEVELOPER_TOKEN in env. Customer query syntax uses
 * GAQL (Google Ads Query Language) — see docs/verification/agent-status.md
 * for example queries.
 */

import { GoogleAdsApi, Customer } from 'google-ads-api';

let api: GoogleAdsApi | null = null;

function getApi(): GoogleAdsApi {
  if (!api) {
    api = new GoogleAdsApi({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    });
  }
  return api;
}

export function googleAdsCustomer(
  customerId: string,
  refreshToken: string,
): Customer {
  return getApi().Customer({
    customer_id: customerId.replace(/-/g, ''),
    refresh_token: refreshToken,
  });
}
