import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CreditsPageClient from './client'

export const metadata = {
  title: 'Credits — Growth OS',
  description: 'One month of full marketing management for less than one agency invoice. See the hard math.',
}

export default async function CreditsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/billing')
  return <CreditsPageClient />
}
