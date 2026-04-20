import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChangelogPageClient from './client'

export const metadata = {
  title: 'Changelog — Growth OS',
  description: 'New features, improvements, and fixes. Shipped regularly.',
  openGraph: {
    title: 'Changelog — Growth OS',
    description: 'New features, improvements, and fixes. Shipped regularly.',
    type: 'website',
  },
}

export default async function ChangelogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  return <ChangelogPageClient />
}
