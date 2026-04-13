/**
 * Meta Marketing API v19.0 — Write Module
 *
 * Handles campaign/adset/ad creation, updates, image uploads,
 * and performance fetching via the Meta Graph API.
 *
 * Server-side only. Credentials are loaded from the `credentials` table
 * (platform = 'meta'). All Meta API errors surface Meta's own error message.
 */

import { createServiceClient } from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const META_API_BASE = 'https://graph.facebook.com/v19.0';

export const OBJECTIVE_MAP: Record<string, string> = {
  awareness: 'OUTCOME_AWARENESS',
  conversion: 'OUTCOME_SALES',
  retention: 'OUTCOME_ENGAGEMENT',
};

export const OPTIMIZATION_GOAL_MAP: Record<string, string> = {
  awareness: 'REACH',
  conversion: 'OFFSITE_CONVERSIONS',
  retention: 'LINK_CLICKS',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetaCredential {
  accessToken: string;
  adAccountId: string; // always includes act_ prefix
}

export interface CreateCampaignParams {
  credential: MetaCredential;
  name: string;
  /** 'awareness' | 'conversion' | 'retention' */
  objective: string;
  /** Daily budget in user currency (will be multiplied by 100 for cents) */
  dailyBudget: number;
  status: 'ACTIVE' | 'PAUSED';
}

export interface CreateCampaignResult {
  id: string;
}

export interface CreateAdSetParams {
  credential: MetaCredential;
  campaignId: string;
  name: string;
  optimizationGoal: string;
  billingEvent: string;
  /** Meta targeting spec object */
  targeting: Record<string, unknown>;
  status: 'ACTIVE' | 'PAUSED';
}

export interface CreateAdSetResult {
  id: string;
}

export interface AdCreativeParams {
  primaryText: string;
  headline: string;
  description?: string;
  linkUrl: string;
  ctaType: string;
  imageUrl?: string;
  imageHash?: string;
}

export interface CreateAdParams {
  credential: MetaCredential;
  adSetId: string;
  name: string;
  creative: AdCreativeParams;
  status: 'ACTIVE' | 'PAUSED';
}

export interface CreateAdResult {
  id: string;
}

export interface AdSetPerformance {
  id: string;
  name: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  actions: MetaAction[];
}

export interface AdPerformance {
  id: string;
  name: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  actions: MetaAction[];
}

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface CampaignPerformance {
  campaignId: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  actions: MetaAction[];
  adSets: AdSetPerformance[];
  ads: AdPerformance[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MetaErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

/**
 * POST to Meta Graph API. Throws with Meta's error message on failure.
 */
async function metaPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${META_API_BASE}/${path}`;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    params.set(
      key,
      typeof value === 'object' ? JSON.stringify(value) : String(value),
    );
  }
  params.set('access_token', accessToken);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const json = (await res.json()) as T & MetaErrorResponse;

  if (!res.ok || (json as MetaErrorResponse).error) {
    const errMsg =
      (json as MetaErrorResponse).error?.message ??
      `Meta API error ${res.status}: ${res.statusText}`;
    throw new Error(errMsg);
  }

  return json;
}

/**
 * GET from Meta Graph API. Throws with Meta's error message on failure.
 */
async function metaGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<T> {
  const searchParams = new URLSearchParams({
    ...params,
    access_token: accessToken,
  });

  const url = `${META_API_BASE}/${path}?${searchParams.toString()}`;
  const res = await fetch(url);
  const json = (await res.json()) as T & MetaErrorResponse;

  if (!res.ok || (json as MetaErrorResponse).error) {
    const errMsg =
      (json as MetaErrorResponse).error?.message ??
      `Meta API error ${res.status}: ${res.statusText}`;
    throw new Error(errMsg);
  }

  return json;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Load Meta credential for a brand from the `credentials` table.
 * Ensures the adAccountId always has the `act_` prefix.
 */
export async function loadMetaCredential(brandId: string): Promise<MetaCredential> {
  const admin = createServiceClient();

  const { data, error } = await admin
    .from('credentials')
    .select('access_token, metadata')
    .eq('brand_id', brandId)
    .eq('platform', 'meta')
    .single();

  if (error || !data) {
    throw new Error(
      `No Meta credential found for brand ${brandId}. ` +
        'Please connect your Meta Ads account in Settings.',
    );
  }

  const rawAccountId = (data.metadata as Record<string, string | null | undefined>)
    ?.ad_account_id;

  if (!rawAccountId) {
    throw new Error(
      `Meta credential for brand ${brandId} is missing ad_account_id in metadata.`,
    );
  }

  const adAccountId = rawAccountId.startsWith('act_')
    ? rawAccountId
    : `act_${rawAccountId}`;

  return {
    accessToken: data.access_token as string,
    adAccountId,
  };
}

/**
 * Create a Meta campaign with Campaign Budget Optimization (CBO) enabled.
 * Daily budget is passed in user currency and converted to cents.
 */
export async function createMetaCampaign(
  params: CreateCampaignParams,
): Promise<CreateCampaignResult> {
  const { credential, name, objective, dailyBudget, status } = params;
  const metaObjective = OBJECTIVE_MAP[objective] ?? objective;

  const result = await metaPost<{ id: string }>(
    `${credential.adAccountId}/campaigns`,
    credential.accessToken,
    {
      name,
      objective: metaObjective,
      status,
      special_ad_categories: '[]',
      // CBO: budget is set at campaign level
      daily_budget: Math.round(dailyBudget * 100),
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    },
  );

  return { id: result.id };
}

/**
 * Create a Meta ad set under an existing CBO campaign.
 * No daily_budget is set since the campaign controls the budget (CBO).
 */
export async function createMetaAdSet(
  params: CreateAdSetParams,
): Promise<CreateAdSetResult> {
  const {
    credential,
    campaignId,
    name,
    optimizationGoal,
    billingEvent,
    targeting,
    status,
  } = params;

  const result = await metaPost<{ id: string }>(
    `${credential.adAccountId}/adsets`,
    credential.accessToken,
    {
      name,
      campaign_id: campaignId,
      optimization_goal: optimizationGoal,
      billing_event: billingEvent,
      targeting,
      status,
    },
  );

  return { id: result.id };
}

/**
 * Download an image from a URL and upload it to Meta as base64.
 * Returns the image hash for use in ad creatives.
 */
export async function uploadAdImage(
  credential: MetaCredential,
  imageUrl: string,
): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(
      `Failed to download image from ${imageUrl}: ${imgRes.status} ${imgRes.statusText}`,
    );
  }

  const buffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  const result = await metaPost<{ images: Record<string, { hash: string }> }>(
    `${credential.adAccountId}/adimages`,
    credential.accessToken,
    { bytes: base64 },
  );

  // Meta returns images keyed by filename; grab the first entry's hash
  const firstImage = Object.values(result.images)[0];
  if (!firstImage?.hash) {
    throw new Error('Meta image upload succeeded but returned no hash');
  }

  return firstImage.hash;
}

/**
 * Create a Meta ad. Uploads the image if imageUrl is provided and no
 * imageHash is present, creates the ad creative, then creates the ad.
 */
export async function createMetaAd(
  params: CreateAdParams,
): Promise<CreateAdResult> {
  const { credential, adSetId, name, creative, status } = params;

  // Resolve image hash
  let imageHash = creative.imageHash;
  if (!imageHash && creative.imageUrl) {
    imageHash = await uploadAdImage(credential, creative.imageUrl);
  }

  if (!imageHash) {
    throw new Error(
      'createMetaAd requires either creative.imageHash or creative.imageUrl',
    );
  }

  // Build object story spec
  const objectStorySpec = {
    page_id: undefined as string | undefined, // caller can extend if needed
    link_data: {
      image_hash: imageHash,
      link: creative.linkUrl,
      message: creative.primaryText,
      name: creative.headline,
      description: creative.description ?? '',
      call_to_action: {
        type: creative.ctaType,
        value: { link: creative.linkUrl },
      },
    },
  };

  // Create ad creative
  const creativeResult = await metaPost<{ id: string }>(
    `${credential.adAccountId}/adcreatives`,
    credential.accessToken,
    {
      name: `${name} Creative`,
      object_story_spec: objectStorySpec,
    },
  );

  // Create the ad
  const adResult = await metaPost<{ id: string }>(
    `${credential.adAccountId}/ads`,
    credential.accessToken,
    {
      name,
      adset_id: adSetId,
      creative: { creative_id: creativeResult.id },
      status,
    },
  );

  return { id: adResult.id };
}

/**
 * Update a campaign's status or daily_budget (budget in cents).
 */
export async function updateMetaCampaign(
  credential: MetaCredential,
  campaignId: string,
  updates: { status?: 'ACTIVE' | 'PAUSED'; dailyBudget?: number },
): Promise<void> {
  const body: Record<string, unknown> = {};

  if (updates.status !== undefined) {
    body['status'] = updates.status;
  }
  if (updates.dailyBudget !== undefined) {
    body['daily_budget'] = Math.round(updates.dailyBudget * 100);
  }

  await metaPost<{ success: boolean }>(
    campaignId,
    credential.accessToken,
    body,
  );
}

/**
 * Update an ad's status (pause or activate).
 */
export async function updateMetaAd(
  credential: MetaCredential,
  adId: string,
  updates: { status: 'ACTIVE' | 'PAUSED' },
): Promise<void> {
  await metaPost<{ success: boolean }>(adId, credential.accessToken, {
    status: updates.status,
  });
}

// ---------------------------------------------------------------------------
// Performance fetching
// ---------------------------------------------------------------------------

interface InsightsResponse {
  data: Array<{
    spend: string;
    impressions: string;
    clicks: string;
    ctr: string;
    cpc: string;
    actions?: MetaAction[];
  }>;
}

interface AdSetListResponse {
  data: Array<{
    id: string;
    name: string;
  }>;
}

interface AdListResponse {
  data: Array<{
    id: string;
    name: string;
  }>;
}

const INSIGHT_FIELDS =
  'spend,impressions,clicks,ctr,cpc,actions';

/**
 * Fetch performance for a campaign, its ad sets, and its ads over last_7d.
 */
export async function fetchCampaignPerformance(
  credential: MetaCredential,
  campaignId: string,
): Promise<CampaignPerformance> {
  // Campaign-level insights
  const campaignInsights = await metaGet<InsightsResponse>(
    `${campaignId}/insights`,
    credential.accessToken,
    {
      date_preset: 'last_7d',
      fields: INSIGHT_FIELDS,
    },
  );

  const campaignData = campaignInsights.data[0];
  const emptyCampaignData = {
    spend: '0',
    impressions: '0',
    clicks: '0',
    ctr: '0',
    cpc: '0',
    actions: [] as MetaAction[],
  };
  const base = campaignData ?? emptyCampaignData;

  // Fetch ad sets under this campaign
  const adSetList = await metaGet<AdSetListResponse>(
    `${campaignId}/adsets`,
    credential.accessToken,
    { fields: 'id,name' },
  );

  // Fetch insights per ad set
  const adSetPerformances = await Promise.all(
    (adSetList.data ?? []).map(async (adSet): Promise<AdSetPerformance> => {
      try {
        const insights = await metaGet<InsightsResponse>(
          `${adSet.id}/insights`,
          credential.accessToken,
          {
            date_preset: 'last_7d',
            fields: INSIGHT_FIELDS,
          },
        );
        const d = insights.data[0];
        return {
          id: adSet.id,
          name: adSet.name,
          spend: d?.spend ?? '0',
          impressions: d?.impressions ?? '0',
          clicks: d?.clicks ?? '0',
          ctr: d?.ctr ?? '0',
          cpc: d?.cpc ?? '0',
          actions: d?.actions ?? [],
        };
      } catch {
        return {
          id: adSet.id,
          name: adSet.name,
          spend: '0',
          impressions: '0',
          clicks: '0',
          ctr: '0',
          cpc: '0',
          actions: [],
        };
      }
    }),
  );

  // Fetch ads under this campaign
  const adList = await metaGet<AdListResponse>(
    `${campaignId}/ads`,
    credential.accessToken,
    { fields: 'id,name' },
  );

  // Fetch insights per ad
  const adPerformances = await Promise.all(
    (adList.data ?? []).map(async (ad): Promise<AdPerformance> => {
      try {
        const insights = await metaGet<InsightsResponse>(
          `${ad.id}/insights`,
          credential.accessToken,
          {
            date_preset: 'last_7d',
            fields: INSIGHT_FIELDS,
          },
        );
        const d = insights.data[0];
        return {
          id: ad.id,
          name: ad.name,
          spend: d?.spend ?? '0',
          impressions: d?.impressions ?? '0',
          clicks: d?.clicks ?? '0',
          ctr: d?.ctr ?? '0',
          cpc: d?.cpc ?? '0',
          actions: d?.actions ?? [],
        };
      } catch {
        return {
          id: ad.id,
          name: ad.name,
          spend: '0',
          impressions: '0',
          clicks: '0',
          ctr: '0',
          cpc: '0',
          actions: [],
        };
      }
    }),
  );

  return {
    campaignId,
    spend: base.spend,
    impressions: base.impressions,
    clicks: base.clicks,
    ctr: base.ctr,
    cpc: base.cpc,
    actions: base.actions ?? [],
    adSets: adSetPerformances,
    ads: adPerformances,
  };
}
