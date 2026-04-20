import { UrlInputCta } from './url-input-cta'
import { CTA_LABELS } from './landing-content'

export function CtaFinal() {
  return (
    <section className="relative overflow-hidden py-24 bg-gradient-to-br from-[#5516be] via-[#6b38d4] to-[#4b1fa8] text-white">
      {/* Soft glow accents */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 w-[500px] h-[500px] rounded-full bg-[#F97316]/20 blur-3xl" />

      <div className="relative max-w-3xl mx-auto px-6 text-center space-y-6">
        <h2 className="font-heading font-bold text-4xl md:text-5xl text-white">
          Still reading? Paste your URL.
        </h2>
        <p className="text-lg text-white/90">Mia begins in 60 seconds.</p>
        <div className="flex justify-center">
          <UrlInputCta size="final" label={CTA_LABELS.final} tone="dark" />
        </div>
      </div>
    </section>
  )
}
