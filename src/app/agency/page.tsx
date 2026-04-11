import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AgencyPageClient from './client'

export const metadata = {
  title: 'Agency — Growth OS',
  description: 'Manage all your brands from one dashboard. White-label, custom skills, and granular access control.',
}

export default async function AgencyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/agency')
  return <AgencyPageClient />
}
