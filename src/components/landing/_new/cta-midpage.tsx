import { UrlInputCta } from './url-input-cta'
import { CTA_LABELS } from './landing-content'

export function CtaMidpage() {
  return (
    <section className="py-16 bg-white border-b border-[#c6c6cd]/10">
      <div className="max-w-3xl mx-auto px-6 text-center space-y-6">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
          See what Mia finds on your store.
        </h2>
        <div className="flex justify-center">
          <UrlInputCta label={CTA_LABELS.midPage} />
        </div>
      </div>
    </section>
  )
}
