import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SecurityPageClient from './client'

export const metadata = {
  title: 'Security — Growth OS',
  description: 'Your data is yours. Always. Bank-grade encryption, data isolation, and full audit logs.',
}

export default async function SecurityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  return <SecurityPageClient />
}
