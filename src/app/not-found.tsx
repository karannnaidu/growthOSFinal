import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/agent-avatar'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#111c2d] text-white flex items-center justify-center px-4">
      {/* Radial glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(99,102,241,0.12) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative text-center max-w-md mx-auto space-y-6">
        {/* Mia avatar */}
        <div className="flex justify-center">
          <div style={{ filter: 'drop-shadow(0 0 20px rgba(99,102,241,0.3))' }}>
            <AgentAvatar agentId="mia" size="xl" />
          </div>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h1 className="font-heading text-5xl font-bold text-foreground">404</h1>
          <p className="font-heading text-xl font-semibold text-foreground">
            Page not found
          </p>
          <p className="text-sm text-white/50 max-w-sm mx-auto">
            Mia looked everywhere, but this page doesn&apos;t exist.
            It might have been moved or deleted.
          </p>
        </div>

        {/* Links */}
        <div className="flex items-center justify-center gap-4 pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-[#6366f1] hover:bg-[#4f52d4] text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 border border-white/10 hover:border-white/20 text-white/70 hover:text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
