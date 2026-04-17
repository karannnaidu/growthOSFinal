import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

interface ConnectRequest {
  brandId: string;
  apiKey: string;
}

interface ConnectResponse {
  success: boolean;
  data?: { status: string };
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

  const { brandId, apiKey } = body;
  if (!brandId || typeof brandId !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'brandId is required', 400);
  }
  if (!apiKey || typeof apiKey !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'apiKey is required', 400);
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

  const { error: credError } = await admin.from('credentials').upsert(
    {
      brand_id: brandId,
      platform: 'chatgpt_ads',
      access_token: apiKey,
      metadata: {
        connected_via: 'manual_api_key',
        connected_at: new Date().toISOString(),
      },
    },
    { onConflict: 'brand_id,platform' },
  );

  if (credError) {
    console.error('[ChatGPT Ads Connect] Failed to store credentials:', credError);
    return errorResponse('DB_ERROR', 'Failed to store credentials', 500);
  }

  return NextResponse.json({ success: true, data: { status: 'connected' } });
}
