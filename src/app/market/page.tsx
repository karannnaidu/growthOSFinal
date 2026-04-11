import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MarketPage from '@/components/landing/market-page'

export const metadata = {
  title: 'Market — Growth OS',
  description:
    'The D2C marketing problem: fragmented tools, silent bias, and decision paralysis. See how Growth OS solves it.',
}

export default async function Market() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return <MarketPage />
}
