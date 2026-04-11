import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/** Server-only admin client that bypasses RLS. Never expose to the browser. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createSupabaseClient(url, key)
}
