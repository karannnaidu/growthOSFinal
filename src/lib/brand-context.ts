import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface BrandContext {
  brandId: string
  brandName: string
  domain: string | null
  plan: string
  focusAreas: string[]
  aiPreset: string
  walletBalance: number
  freeCredits: number
}

export async function getBrandContext(): Promise<BrandContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Try owner first
  let { data: brand } = await supabase
    .from('brands')
    .select('id, name, domain, plan, focus_areas, ai_preset')
    .eq('owner_id', user.id)
    .limit(1)
    .single()

  // Fallback to member
  if (!brand) {
    const { data: membership } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
    if (!membership) redirect('/onboarding/connect-store')
    const { data: memberBrand } = await supabase
      .from('brands')
      .select('id, name, domain, plan, focus_areas, ai_preset')
      .eq('id', membership.brand_id)
      .single()
    brand = memberBrand
  }

  if (!brand) redirect('/onboarding/connect-store')

  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance, free_credits')
    .eq('brand_id', brand.id)
    .single()

  return {
    brandId: brand.id,
    brandName: brand.name,
    domain: brand.domain,
    plan: brand.plan,
    focusAreas: brand.focus_areas || [],
    aiPreset: brand.ai_preset,
    walletBalance: wallet?.balance ?? 0,
    freeCredits: wallet?.free_credits ?? 0,
  }
}
