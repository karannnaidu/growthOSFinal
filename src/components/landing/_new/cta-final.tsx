import { UrlInputCta } from './url-input-cta'
import { CTA_LABELS } from './landing-content'

export function CtaFinal() {
  return (
    <section className="py-20 bg-gradient-to-br from-[#6b38d4] to-[#0b1c30] text-white">
      <div className="max-w-3xl mx-auto px-6 text-center space-y-6">
        <h2 className="font-heading font-bold text-4xl md:text-5xl">
          Still reading? Paste your URL.
        </h2>
        <p className="text-lg text-white/80">Mia begins in 60 seconds.</p>
        <div className="flex justify-center">
          <UrlInputCta size="final" label={CTA_LABELS.final} />
        </div>
      </div>
    </section>
  )
}
