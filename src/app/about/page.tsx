import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AboutPageClient from './client'

export const metadata = {
  title: 'About — Growth OS',
  description: 'Security, data isolation, and the agency tier — learn about Growth OS.',
}

export default async function AboutPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  return <AboutPageClient />
}
