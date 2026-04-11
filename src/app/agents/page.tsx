import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AgentsPageClient from './client'

export const metadata = {
  title: 'Agents — Growth OS',
  description: 'Meet Aria, Luna, Penny, Hugo, Nova and more — 12 specialized AI agents covering every corner of your marketing funnel.',
}

export default async function AgentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/agents')
  return <AgentsPageClient />
}
