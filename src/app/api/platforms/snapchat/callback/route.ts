import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');
  const errorParam = searchParams.get('error');

  let brandId = '';
  let returnTo = '/dashboard/settings/platforms';
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw || '', 'base64url').toString());
    brandId = decoded.brandId || '';
    returnTo = decoded.returnTo || returnTo;
  } catch {
    brandId = stateRaw || '';
  }

  const failUrl = `${returnTo}?error=snapchat_failed`;

  if (errorParam) {
    console.error('[Snapchat Callback] OAuth error:', errorParam);
    return NextResponse.redirect(new URL(failUrl, request.url));
  }
  if (!code || !brandId) {
    return NextResponse.redirect(new URL(failUrl, request.url));
  }

  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[Snapchat Callback] SNAPCHAT_CLIENT_ID/SECRET not configured');
    return NextResponse.redirect(new URL(failUrl, request.url));
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    `https://${request.headers.get('host') ?? 'localhost:3000'}`;
  const redirectUri = `${appUrl}/api/platforms/snapchat/callback`;

  let tokens: { access_token?: string; refresh_token?: string; expires_in?: number };
  try {
    const res = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) {
      console.error('[Snapchat Callback] token exchange failed:', res.status, await res.text());
      return NextResponse.redirect(new URL(failUrl, request.url));
    }
    tokens = await res.json();
  } catch (err) {
    console.error('[Snapchat Callback] token exchange error:', err);
    return NextResponse.redirect(new URL(failUrl, request.url));
  }

  if (!tokens.access_token) {
    return NextResponse.redirect(new URL(failUrl, request.url));
  }

  const admin = createServiceClient();
  await admin.from('credentials').upsert(
    {
      brand_id: brandId,
      platform: 'snapchat',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      metadata: {},
    },
    { onConflict: 'brand_id,platform' },
  );

  return NextResponse.redirect(new URL(`${returnTo}?connected=snapchat`, request.url));
}
