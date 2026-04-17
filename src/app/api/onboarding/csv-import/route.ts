import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseCsv } from '@/lib/csv/parseCsv';
import {
  ORDER_COLUMN_MAP,
  CUSTOMER_COLUMN_MAP,
  PRODUCT_COLUMN_MAP,
  pickField,
} from '@/lib/csv/mappings';

type EntityType = 'orders' | 'customers' | 'products';

const ENTITY_TABLE: Record<EntityType, string> = {
  orders: 'brand_csv_orders',
  customers: 'brand_csv_customers',
  products: 'brand_csv_products',
};

async function verifyBrandAccess(userId: string, brandId: string) {
  const admin = createServiceClient();
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single();
  if (!brand) return false;
  if (brand.owner_id === userId) return true;
  const { data: membership } = await admin
    .from('brand_members')
    .select('brand_id')
    .eq('brand_id', brandId)
    .eq('user_id', userId)
    .single();
  return !!membership;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const form = await req.formData();
  const brandId = form.get('brandId') as string | null;
  const entity = form.get('entity') as EntityType | null;
  const file = form.get('file') as File | null;

  if (!brandId || !entity || !ENTITY_TABLE[entity] || !file) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const allowed = await verifyBrandAccess(user.id, brandId);
  if (!allowed) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const text = await file.text();
  const parsed = parseCsv<Record<string, unknown>>(text);

  const admin = createServiceClient();
  const { data: imp, error: impErr } = await admin
    .from('brand_csv_imports')
    .insert({
      brand_id: brandId,
      entity_type: entity,
      filename: file.name,
      row_count: parsed.rows.length,
      imported_by: user.id,
      status: 'pending',
    })
    .select('id')
    .single();

  if (impErr || !imp) {
    return NextResponse.json({ error: impErr?.message ?? 'insert-failed' }, { status: 500 });
  }

  const mapped = parsed.rows
    .map((r) => {
      if (entity === 'orders') {
        const orderId = pickField(r, ORDER_COLUMN_MAP.order_id);
        if (!orderId) return null;
        return {
          brand_id: brandId,
          import_id: imp.id,
          order_id: orderId,
          customer_email: pickField(r, ORDER_COLUMN_MAP.customer_email),
          total_price: Number(pickField(r, ORDER_COLUMN_MAP.total_price) ?? 0),
          currency: pickField(r, ORDER_COLUMN_MAP.currency),
          created_at: pickField(r, ORDER_COLUMN_MAP.created_at),
        };
      }
      if (entity === 'customers') {
        const email = pickField(r, CUSTOMER_COLUMN_MAP.email);
        if (!email) return null;
        return {
          brand_id: brandId,
          import_id: imp.id,
          email,
          first_name: pickField(r, CUSTOMER_COLUMN_MAP.first_name),
          last_name: pickField(r, CUSTOMER_COLUMN_MAP.last_name),
          total_spent: Number(pickField(r, CUSTOMER_COLUMN_MAP.total_spent) ?? 0),
          orders_count: Number(pickField(r, CUSTOMER_COLUMN_MAP.orders_count) ?? 0),
        };
      }
      const title = pickField(r, PRODUCT_COLUMN_MAP.title);
      if (!title) return null;
      return {
        brand_id: brandId,
        import_id: imp.id,
        sku: pickField(r, PRODUCT_COLUMN_MAP.sku),
        title,
        price: Number(pickField(r, PRODUCT_COLUMN_MAP.price) ?? 0),
        inventory: Number(pickField(r, PRODUCT_COLUMN_MAP.inventory) ?? 0),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const CHUNK = 500;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const slice = mapped.slice(i, i + CHUNK);
    const query = admin.from(ENTITY_TABLE[entity]);
    const { error } =
      entity === 'orders'
        ? await query.upsert(slice, { onConflict: 'brand_id,order_id' })
        : await query.insert(slice);
    if (error) {
      await admin
        .from('brand_csv_imports')
        .update({ status: 'failed', error_message: error.message })
        .eq('id', imp.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await admin
    .from('brand_csv_imports')
    .update({ status: 'completed' })
    .eq('id', imp.id);

  return NextResponse.json({
    ok: true,
    importId: imp.id,
    rowCount: mapped.length,
    parseErrors: parsed.errors.slice(0, 10),
  });
}
