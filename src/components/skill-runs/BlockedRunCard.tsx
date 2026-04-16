import Link from 'next/link';

interface Props {
  agentName: string;
  skillName: string;
  blockedReason: string;
  missingPlatforms: string[];
  createdAt?: string;
}

const FRIENDLY_PLATFORM: Record<string, string> = {
  shopify: 'Shopify',
  meta: 'Meta Ads',
  google: 'Google Analytics',
  ga4: 'Google Analytics',
  gsc: 'Google Search Console',
  klaviyo: 'Klaviyo',
  brand: 'product catalog',
};

function friendlyPlatform(slug: string): string {
  return FRIENDLY_PLATFORM[slug] ?? slug;
}

export function BlockedRunCard({
  agentName,
  skillName,
  blockedReason,
  missingPlatforms,
  createdAt,
}: Props) {
  const realPlatforms = missingPlatforms.filter(p => p !== 'brand');
  const importableShopify = missingPlatforms.includes('shopify');

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-amber-800">
          {agentName} · {skillName}
        </div>
        {createdAt && (
          <div className="text-[11px] text-amber-700/70">
            {new Date(createdAt).toLocaleString()}
          </div>
        )}
      </div>
      <p className="mt-2 text-sm font-medium text-neutral-900">I couldn&apos;t run this.</p>
      <p className="mt-1 text-sm text-neutral-700">{blockedReason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {realPlatforms.map(p => (
          <Link
            key={p}
            href={`/dashboard/settings/platforms?connect=${p}`}
            className="inline-flex items-center rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Connect {friendlyPlatform(p)}
          </Link>
        ))}
        {importableShopify && (
          <Link
            href="/dashboard/data/import?kind=orders"
            className="inline-flex items-center rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Import orders CSV instead
          </Link>
        )}
      </div>
    </div>
  );
}
