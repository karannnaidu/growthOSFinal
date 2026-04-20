import { PublicNav } from './public-nav'
import { PublicFooter } from './public-footer'
import { HeroSplitCanvas } from './hero-split-canvas'
import { IntegrationsMarquee } from './integrations-marquee'
import { OneCrewBlock } from './one-crew-block'
import { CtaMidpage } from './cta-midpage'
import { ResultsStrip } from './results-strip'
import { FounderNote } from './founder-note'
import { TrustBadges } from './trust-badges'
import { FaqAccordion } from './faq-accordion'
import { CtaFinal } from './cta-final'
import { StickyMobileCta } from './sticky-mobile-cta'

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
