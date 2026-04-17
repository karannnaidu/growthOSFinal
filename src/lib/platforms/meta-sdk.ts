/**
 * Meta Marketing SDK wrapper.
 *
 * Replaces direct `graph.facebook.com/v19.0/...` fetches with
 * facebook-nodejs-business-sdk so we don't have to track API version bumps
 * manually. Returns an AdAccount object ready for `.getInsights()` /
 * `.getAdSets()` calls.
 */

import { FacebookAdsApi, AdAccount } from 'facebook-nodejs-business-sdk';

export function metaAdAccount(accessToken: string, adAccountId: string): AdAccount {
  FacebookAdsApi.init(accessToken);
  const normalized = adAccountId.startsWith('act_')
    ? adAccountId
    : `act_${adAccountId}`;
  return new AdAccount(normalized);
}
