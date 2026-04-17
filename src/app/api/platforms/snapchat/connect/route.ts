import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

interface ConnectRequest {
  brandId: string;
  returnTo?: string;
}

interface ConnectResponse {
  success: boolean;
  data?: { redirectUrl: string };
  error?: { code: string; message: string };
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<ConnectResponse> {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse<ConnectResponse>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);

  let body: Partial<ConnectRequest>;
  try {
    body = await request.json();
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const { brandId, returnTo } = body;
  if (!brandId || typeof brandId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'brandId is required', 400);
  }

  const admin = createServiceClient();
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single();
  if (!brand) return errorResponse('NOT_FOUND', 'Brand not found', 404);

  if (brand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single();
    if (!membership) return errorResponse('FORBIDDEN', 'Access denied', 403);
  }

  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  if (!clientId) {
    return errorResponse('CONFIG_ERROR', 'SNAPCHAT_CLIENT_ID not configured', 500);
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    `https://${request.headers.get('host') ?? 'localhost:3000'}`;

  const redirectUri = `${appUrl}/api/platforms/snapchat/callback`;

  const statePayload = JSON.stringify({
    brandId,
    returnTo: returnTo || '/dashboard/settings/platforms',
  });
  const state = Buffer.from(statePayload).toString('base64url');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'snapchat-marketing-api',
    state,
  });

  const redirectUrl = `https://accounts.snapchat.com/accounts/oauth2/auth?${params.toString()}`;

  return NextResponse.json({ success: true, data: { redirectUrl } });
}
