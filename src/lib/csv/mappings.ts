export const ORDER_COLUMN_MAP = {
  order_id: ['name', 'order_id', 'id', 'order_number'],
  customer_email: ['email', 'customer_email'],
  total_price: ['total', 'total_price', 'order_total'],
  currency: ['currency'],
  created_at: ['created_at', 'processed_at', 'order_date'],
} as const;

export const CUSTOMER_COLUMN_MAP = {
  email: ['email'],
  first_name: ['first_name', 'firstname'],
  last_name: ['last_name', 'lastname'],
  total_spent: ['total_spent', 'lifetime_spend'],
  orders_count: ['orders_count', 'order_count', 'total_orders'],
  tags: ['tags'],
} as const;

export const PRODUCT_COLUMN_MAP = {
  sku: ['sku', 'variant_sku'],
  title: ['title', 'name', 'product_name'],
  price: ['price', 'variant_price'],
  inventory: ['inventory', 'inventory_quantity', 'stock'],
  tags: ['tags'],
} as const;

export function pickField(
  row: Record<string, unknown>,
  aliases: readonly string[],
): string | null {
  for (const a of aliases) {
    const v = row[a];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return null;
}
