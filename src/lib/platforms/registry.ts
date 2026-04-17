// src/lib/platforms/registry.ts
//
// Single source of truth for which platforms the app advertises.
// `comingSoon: true` means the connector is stubbed — hide it in the UI
// unless the caller opts in via ?show=all.

export type PlatformId =
  | 'shopify'
  | 'meta'
  | 'google'              // unified Google (Analytics + Ads)
  | 'google_analytics'    // separate slug if used elsewhere
  | 'klaviyo'
  | 'ahrefs'
  | 'snapchat'
  | 'chatgpt_ads';

export interface PlatformDefinition {
  id: PlatformId;
  name: string;
  comingSoon: boolean;
  description?: string;
}

export const PLATFORMS: PlatformDefinition[] = [
  { id: 'shopify', name: 'Shopify', comingSoon: false, description: 'Connect your Shopify store to unlock orders, products, and customers.' },
  { id: 'meta', name: 'Meta Ads', comingSoon: false, description: 'Connect Meta to see campaign performance and manage audiences.' },
  { id: 'google', name: 'Google (Analytics + Ads)', comingSoon: false, description: 'Google Analytics 4 and Google Ads — single OAuth.' },
  { id: 'klaviyo', name: 'Klaviyo', comingSoon: false, description: 'Email + SMS flows and subscriber profiles.' },
  { id: 'ahrefs', name: 'Ahrefs', comingSoon: true, description: 'Backlinks + keyword research.' },
  { id: 'snapchat', name: 'Snapchat Ads', comingSoon: false, description: 'Gen-Z reach and campaign performance.' },
  { id: 'chatgpt_ads', name: 'ChatGPT Ads', comingSoon: false, description: 'AI-native ad platform.' },
];

export function visiblePlatforms(showAll: boolean): PlatformDefinition[] {
  return showAll ? PLATFORMS : PLATFORMS.filter(p => !p.comingSoon);
}
