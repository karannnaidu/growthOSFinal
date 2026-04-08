import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Sparkles } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userEmail = user?.email ?? 'there'

  return (
    <div className="animate-fade-in space-y-6">
      {/* Welcome card */}
      <Card className="glass-panel glow-mia max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6366f1]/15">
              <Sparkles className="h-5 w-5 text-[#6366f1]" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-xl font-heading font-semibold">
                Welcome to Growth OS
              </CardTitle>
              <CardDescription className="mt-0.5">
                {userEmail}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your AI-powered marketing command center is ready. Use the sidebar to navigate
            between agents, chats, and settings. More capabilities are coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
