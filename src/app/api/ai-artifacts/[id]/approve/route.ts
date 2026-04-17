import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  void request;
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createServiceClient();
  const { data: node } = await admin.from('knowledge_nodes')
    .select('id, brand_id, properties')
    .eq('id', id)
    .eq('node_type', 'ai_artifact')
    .single();
  if (!node) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Authorize: user must own the brand or be a member.
  const { data: brand } = await admin.from('brands')
    .select('owner_id')
    .eq('id', node.brand_id)
    .single();
  if (brand?.owner_id !== user.id) {
    const { data: member } = await admin.from('brand_members')
      .select('brand_id')
      .eq('brand_id', node.brand_id)
      .eq('user_id', user.id)
      .single();
    if (!member) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const updatedProperties = {
    ...(node.properties as Record<string, unknown>),
    status: 'approved',
  };
  await admin.from('knowledge_nodes')
    .update({ properties: updatedProperties, updated_at: new Date().toISOString() })
    .eq('id', id);

  return new Response(JSON.stringify({ id, status: 'approved' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
