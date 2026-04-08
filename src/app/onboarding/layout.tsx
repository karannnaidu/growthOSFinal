import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Get Started — Growth OS',
  description: 'Set up your Growth OS account in just a few steps.',
}

const STEPS = [
  { path: 'connect-store', label: 'Connect Store' },
  { path: 'focus', label: 'Pick Focus' },
  { path: 'platforms', label: 'Ad Platforms' },
  { path: 'diagnosis', label: 'Diagnosis' },
]

interface OnboardingLayoutProps {
  children: React.ReactNode
}

export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar with logo + steps */}
      <header className="fixed top-0 inset-x-0 z-40 border-b border-border/50 backdrop-blur-md bg-background/80">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-6">
          {/* Logo */}
          <span className="font-heading font-bold text-lg tracking-tight text-foreground">
            Growth<span className="text-[#6366f1]">OS</span>
          </span>

          {/* Step dots — desktop */}
          <nav className="hidden sm:flex items-center gap-2">
            {STEPS.map((step, i) => (
              <div key={step.path} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full text-xs flex items-center justify-center font-medium font-metric border"
                  style={{
                    background: 'transparent',
                    borderColor: 'oklch(1 0 0 / 15%)',
                    color: 'oklch(0.65 0.02 243)',
                  }}
                >
                  {i + 1}
                </div>
                <span
                  className="text-xs hidden md:block"
                  style={{ color: 'oklch(0.65 0.02 243)' }}
                >
                  {step.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className="w-8 h-px hidden md:block"
                    style={{ background: 'oklch(1 0 0 / 10%)' }}
                  />
                )}
              </div>
            ))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 pt-14 flex items-center justify-center px-4 py-12">
        {children}
      </main>
    </div>
  )
}
