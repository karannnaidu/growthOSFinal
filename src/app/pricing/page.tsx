import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PricingPageClient from './client'

export const metadata = {
  title: 'Pricing — Growth OS',
  description: 'Simple, transparent pricing. Start free. Scale as you grow. Cancel anytime.',
}

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/billing')
  return <PricingPageClient />
}
