-- 007-csv-import.sql
-- CSV import tables: track uploads and store rows that back brand.* resolvers
-- when Shopify OAuth is absent.

create table if not exists brand_csv_imports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  entity_type text not null check (entity_type in ('orders','customers','products')),
  filename text not null,
  row_count int not null default 0,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) on delete set null,
  status text not null default 'completed' check (status in ('pending','completed','failed')),
  error_message text
);

create index if not exists brand_csv_imports_brand_idx
  on brand_csv_imports(brand_id, entity_type, imported_at desc);

create table if not exists brand_csv_orders (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  import_id uuid not null references brand_csv_imports(id) on delete cascade,
  order_id text not null,
  order_number text,
  customer_email text,
  total_price numeric(12,2),
  currency text,
  line_items jsonb,
  created_at timestamptz,
  inserted_at timestamptz not null default now(),
  unique(brand_id, order_id)
);

create index if not exists brand_csv_orders_brand_idx
  on brand_csv_orders(brand_id, created_at desc);

create table if not exists brand_csv_customers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  import_id uuid not null references brand_csv_imports(id) on delete cascade,
  customer_id text,
  email text,
  first_name text,
  last_name text,
  total_spent numeric(12,2),
  orders_count int,
  tags text[],
  created_at timestamptz,
  inserted_at timestamptz not null default now()
);

create index if not exists brand_csv_customers_brand_idx
  on brand_csv_customers(brand_id, email);

create table if not exists brand_csv_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  import_id uuid not null references brand_csv_imports(id) on delete cascade,
  product_id text,
  sku text,
  title text not null,
  price numeric(12,2),
  inventory int,
  tags text[],
  inserted_at timestamptz not null default now()
);

create index if not exists brand_csv_products_brand_idx
  on brand_csv_products(brand_id);

alter table brand_csv_imports enable row level security;
alter table brand_csv_orders enable row level security;
alter table brand_csv_customers enable row level security;
alter table brand_csv_products enable row level security;

drop policy if exists "brand members read csv_imports" on brand_csv_imports;
create policy "brand members read csv_imports" on brand_csv_imports
  for select using (brand_id in (
    select brand_id from brand_members where user_id = auth.uid()
    union select id from brands where owner_id = auth.uid()
  ));
drop policy if exists "brand members read csv_orders" on brand_csv_orders;
create policy "brand members read csv_orders" on brand_csv_orders
  for select using (brand_id in (
    select brand_id from brand_members where user_id = auth.uid()
    union select id from brands where owner_id = auth.uid()
  ));
drop policy if exists "brand members read csv_customers" on brand_csv_customers;
create policy "brand members read csv_customers" on brand_csv_customers
  for select using (brand_id in (
    select brand_id from brand_members where user_id = auth.uid()
    union select id from brands where owner_id = auth.uid()
  ));
drop policy if exists "brand members read csv_products" on brand_csv_products;
create policy "brand members read csv_products" on brand_csv_products
  for select using (brand_id in (
    select brand_id from brand_members where user_id = auth.uid()
    union select id from brands where owner_id = auth.uid()
  ));
