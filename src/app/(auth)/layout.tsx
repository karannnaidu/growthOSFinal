export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      {/* Subtle radial gradient overlay for depth */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, oklch(0.35 0.12 264 / 0.25) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md animate-slide-up">
        {children}
      </div>
    </div>
  )
}
