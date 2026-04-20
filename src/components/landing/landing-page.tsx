import { PublicNav } from './public-nav'
import { PublicFooter } from './public-footer'
import { HeroSplitCanvas } from './_new/hero-split-canvas'
import { IntegrationsMarquee } from './_new/integrations-marquee'
import { OneCrewBlock } from './_new/one-crew-block'
import { CtaMidpage } from './_new/cta-midpage'
import { ResultsStrip } from './_new/results-strip'
import { FounderNote } from './_new/founder-note'
import { TrustBadges } from './_new/trust-badges'
import { FaqAccordion } from './_new/faq-accordion'
import { CtaFinal } from './_new/cta-final'
import { StickyMobileCta } from './_new/sticky-mobile-cta'

export default function LandingPage() {
  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        <HeroSplitCanvas />
        <IntegrationsMarquee />
        <OneCrewBlock />
        <CtaMidpage />
        <ResultsStrip />
        <FounderNote />
        <TrustBadges />
        <FaqAccordion />
        <CtaFinal />
      </main>
      <PublicFooter />
      <StickyMobileCta />
    </div>
  )
}
