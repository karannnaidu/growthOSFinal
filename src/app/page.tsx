import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LandingPage from '@/components/landing/landing-page'

export const metadata = {
  title: 'Growth OS — Your AI Marketing Team',
  description:
    '12 AI agents that diagnose, create, optimize, and grow your D2C brand for less than the cost of a single freelancer.',
  openGraph: {
    title: 'Growth OS — Your AI Marketing Team',
    description:
      '12 AI agents that diagnose, create, optimize, and grow your D2C brand.',
    type: 'website',
  },
}

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return <LandingPage />
}
