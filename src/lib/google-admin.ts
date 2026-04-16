// src/lib/google-admin.ts
//
// Auto-discover GA4 properties and Google Ads accessible customers
// after OAuth, so users don't have to paste IDs manually.

export interface Ga4Property {
  property: string       // e.g. "properties/123456789"
  propertyId: string     // just "123456789"
  displayName: string
  accountDisplayName: string
}

export interface GoogleAdsCustomer {
  customerId: string     // just digits
  resourceName: string   // e.g. "customers/1234567890"
}

export async function listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
  const r = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`GA4 accountSummaries failed: ${r.status} ${body}`)
  }
  const json = (await r.json()) as {
    accountSummaries?: Array<{
      displayName?: string
      propertySummaries?: Array<{
        property?: string
        displayName?: string
      }>
    }>
  }
  const out: Ga4Property[] = []
  for (const acct of json.accountSummaries ?? []) {
    for (const p of acct.propertySummaries ?? []) {
      const full = String(p.property ?? '')
      const id = full.replace(/^properties\//, '')
      out.push({
        property: full,
        propertyId: id,
        displayName: String(p.displayName ?? ''),
        accountDisplayName: String(acct.displayName ?? ''),
      })
    }
  }
  return out
}

export async function listGoogleAdsCustomers(
  accessToken: string,
  developerToken: string,
): Promise<GoogleAdsCustomer[]> {
  const r = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
    },
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`Google Ads listAccessibleCustomers failed: ${r.status} ${body}`)
  }
  const json = (await r.json()) as { resourceNames?: string[] }
  const out: GoogleAdsCustomer[] = []
  for (const rn of json.resourceNames ?? []) {
    const id = rn.replace(/^customers\//, '')
    out.push({ resourceName: rn, customerId: id })
  }
  return out
}
