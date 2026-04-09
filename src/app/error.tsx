'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-[#111c2d] text-white flex items-center justify-center px-4">
      {/* Radial glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(239,68,68,0.08) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative text-center max-w-md mx-auto">
        <div className="glass-panel glass-glow rounded-2xl p-8 space-y-6">
          {/* Error icon */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
            <svg
              className="h-7 w-7 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <h1 className="font-heading text-xl font-bold text-foreground">
              Something went wrong
            </h1>
            <p className="text-sm text-white/50">
              An unexpected error occurred. Our team has been notified.
              {error.digest && (
                <span className="block mt-1 font-mono text-xs text-white/30">
                  Error ID: {error.digest}
                </span>
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={reset}
              className="w-full bg-[#6366f1] hover:bg-[#4f52d4] text-white font-semibold"
            >
              Try again
            </Button>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-[#6366f1] hover:text-[#4f52d4] underline-offset-4 hover:underline"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
