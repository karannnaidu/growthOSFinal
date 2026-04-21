/**
 * Minimal type shim for facebook-nodejs-business-sdk.
 *
 * The vendor ships pure JS without .d.ts. We only use a tiny surface —
 * FacebookAdsApi.init() for auth, and AdAccount's getInsights / getAdSets.
 * Expand this shim as more endpoints are wired.
 */

declare module 'facebook-nodejs-business-sdk' {
  export class FacebookAdsApi {
    static init(accessToken: string): FacebookAdsApi;
  }

  export class AdAccount {
    constructor(id: string);
    getInsights(fields: string[], params?: Record<string, unknown>): Promise<unknown[]>;
    getAdSets(fields: string[], params?: Record<string, unknown>): Promise<unknown[]>;
    getCampaigns(fields: string[], params?: Record<string, unknown>): Promise<unknown[]>;
    getAds(fields: string[], params?: Record<string, unknown>): Promise<unknown[]>;
    read(fields: string[]): Promise<Record<string, unknown>>;
  }
}
