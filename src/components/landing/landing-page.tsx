import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { PublicNav } from './public-nav'
import { PublicFooter } from './public-footer'

// ── Stars helper ─────────────────────────────────────────────────
function Stars() {
  return (
    <div className="flex text-[#6b38d4]">
      {[...Array(5)].map((_, i) => (
        <svg key={i} className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

// ── Arrow icon ───────────────────────────────────────────────────
function ArrowForward({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  )
}

// ── Check / Cancel icons ────────────────────────────────────────
function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  )
}

function CancelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
    </svg>
  )
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen [&_*]:!border-[#c6c6cd]/20">
      <PublicNav />

      <main className="pt-20">
        {/* ══════════════════════════════════════════════════════════
            HERO SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-[#f8f9ff] pt-12 pb-24 border-b border-[#c6c6cd]/10">
          <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-12 items-center">
            {/* Left column — text */}
            <div className="lg:col-span-6 space-y-8 relative z-10 order-2 lg:order-1">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#dce9ff] border border-[#c6c6cd]/10">
                <span className="w-2 h-2 rounded-full bg-[#6b38d4] animate-pulse" />
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#45464d]">Now in Version 2.0</span>
              </div>

              <h1 className="font-heading font-extrabold text-5xl md:text-7xl lg:text-8xl tracking-tighter leading-[1.0] text-[#0b1c30]">
                Meet Mia: Your <span className="text-[#6b38d4]">AI Chief of Staff.</span>
              </h1>

              <p className="text-xl text-[#45464d] max-w-xl leading-relaxed">
                The Orchestrated Intelligence built for Shopify. Mia doesn&apos;t just process data; she manages a specialized marketing team that works automatically while you sleep.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-6 pt-4">
                <Link
                  href="/signup"
                  className="w-full sm:w-auto bg-[#0b1c30] text-white px-10 py-5 rounded-xl font-heading font-bold text-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-black/10 group"
                >
                  Deploy Mia Now
                  <ArrowForward className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto px-10 py-5 rounded-xl font-heading font-bold text-lg border border-[#c6c6cd] hover:bg-[#eff4ff] transition-all text-center"
                >
                  Watch Demo
                </Link>
              </div>

              <div className="flex items-center gap-2 text-sm font-medium text-[#45464d]/70 italic">
                <svg className="w-4 h-4 text-[#6b38d4]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" /></svg>
                Native Shopify Integration Live
              </div>
            </div>

            {/* Right column — Mia portrait */}
            <div className="lg:col-span-6 relative order-1 lg:order-2">
              <div className="relative z-20 mx-auto w-full max-w-lg aspect-square flex flex-col items-center justify-center">
                <div className="relative group">
                  {/* Aura glow */}
                  <div className="absolute inset-0 bg-[#6b38d4]/20 rounded-full blur-[80px] scale-125 animate-pulse" />

                  {/* Avatar container */}
                  <div className="relative bg-white/80 backdrop-blur-[20px] rounded-full p-2 border border-white/40 shadow-[0_0_50px_rgba(107,56,212,0.2)] overflow-hidden">
                    <div className="w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden">
                      <AgentAvatar agentId="mia" size="xl" className="!w-full !h-full !rounded-full" />
                    </div>
                  </div>

                  {/* Orchestrator label */}
                  <div className="absolute -top-4 -right-4 bg-white/90 backdrop-blur px-4 py-2 rounded-2xl shadow-xl border border-[#6b38d4]/20 transform rotate-6">
                    <span className="text-xs font-bold text-[#6b38d4] uppercase tracking-widest">Orchestrator</span>
                  </div>

                  {/* Quote bubble */}
                  <div className="absolute -bottom-6 -left-4 bg-white/80 backdrop-blur-[20px] px-6 py-3 rounded-2xl shadow-xl border border-white/40 max-w-[240px]">
                    <p className="text-[10px] italic text-[#45464d] leading-tight">&ldquo;Aria is designing the campaign, Scout is analyzing competitors...&rdquo;</p>
                    <div className="mt-2 flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#6b38d4]" />
                      <span className="w-2 h-2 rounded-full bg-[#6b38d4]/30" />
                      <span className="w-2 h-2 rounded-full bg-[#6b38d4]/30" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Background blur */}
              <div className="absolute inset-0 z-0 bg-gradient-to-tr from-[#6b38d4]/10 via-transparent to-[#d3e4fe]/30 rounded-full blur-3xl scale-110" />
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            SOCIAL PROOF — TESTIMONIALS
        ══════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-[#eff4ff]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#e9ddff] text-[#23005c] rounded-full">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                <span className="text-[10px] font-bold tracking-widest uppercase">E-Commerce Intelligence</span>
              </div>
              <h2 className="font-heading font-extrabold text-4xl md:text-5xl tracking-tight text-[#0b1c30]">
                Trusted by D2C founders doing <span className="text-[#6b38d4]">₹10L to ₹10Cr/month</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { quote: '"Mia flagged a drop in ROAS before I even noticed. She paused the ad and briefed me by 9am."', role: 'Founder, skincare brand', city: 'Mumbai' },
                { quote: '"I used to spend 3 hours every Monday reviewing metrics. Now I read a 5-minute briefing."', role: 'Founder, supplements brand', city: 'Bengaluru' },
                { quote: '"The ad copy Aria generated outperformed my agency\'s work in the first split test."', role: 'Founder, fashion brand', city: 'Delhi' },
              ].map((t, i) => (
                <div key={i} className="bg-white p-8 rounded-[2rem] border border-[#c6c6cd]/10 shadow-sm flex flex-col justify-between transition-transform hover:scale-[1.02] duration-300">
                  <div className="space-y-6">
                    <Stars />
                    <p className="text-lg font-medium leading-relaxed text-[#0b1c30] italic">{t.quote}</p>
                  </div>
                  <div className="mt-8 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#dce9ff] flex items-center justify-center">
                      <PersonIcon className="w-5 h-5 text-[#6b38d4]" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{t.role}</p>
                      <p className="text-xs text-[#45464d] uppercase tracking-widest">{t.city}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            INTEGRATIONS & AUTONOMY BENTO
        ══════════════════════════════════════════════════════════ */}
        <section className="py-12 bg-[#f8f9ff]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-2 p-8 rounded-3xl bg-[#eff4ff] border border-[#c6c6cd]/10">
                <span className="text-[#6b38d4] font-bold text-sm uppercase tracking-widest block mb-4">Autonomy</span>
                <h4 className="text-2xl font-heading font-bold text-[#0b1c30] mb-4">Works while you sleep.</h4>
                <p className="text-[#45464d] font-medium">Growth OS handles the execution loop 24/7. From media buying to SEO content, your agents never take a day off.</p>
              </div>
              <div className="p-8 rounded-3xl bg-[#0b1c30] text-white border border-white/5 relative overflow-hidden flex flex-col justify-end min-h-[240px]">
                <div className="relative z-10">
                  <h4 className="text-5xl font-extrabold font-heading tracking-tighter mb-2">Shopify</h4>
                  <p className="text-white/60 text-xs font-bold uppercase">Native Integration</p>
                </div>
                <div className="absolute -right-8 -bottom-8 opacity-20">
                  <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                </div>
              </div>
              <div className="p-8 rounded-3xl bg-[#e9ddff] text-[#23005c] border border-[#6b38d4]/10">
                <svg className="w-10 h-10 mb-4 text-[#6b38d4]" fill="currentColor" viewBox="0 0 24 24"><path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" /></svg>
                <h4 className="text-2xl font-heading font-bold mb-2">Aria-Powered</h4>
                <p className="text-[#5516be] text-sm font-medium leading-relaxed">Generative creative assets that actually match your brand voice.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            MARKET GAP SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <header className="mb-16 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#d3e4fe] rounded-full mb-6">
                <span className="w-2 h-2 bg-[#6b38d4] rounded-full animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-[#6b38d4]">Market Landscape</span>
              </div>
              <h2 className="font-heading text-4xl md:text-5xl font-extrabold tracking-tighter text-[#0b1c30] mb-6 max-w-4xl mx-auto leading-[1.1]">
                Current tools either create content or optimise ads. <span className="text-[#6b38d4]">None think for you.</span>
              </h2>
              <p className="text-[#45464d] text-lg max-w-2xl mx-auto">
                The modern growth stack is fractured between creative silos and analytical black boxes. Growth OS v2 closes the cognitive loop.
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Left: Content Creation & Ad Optimization */}
              <div className="lg:col-span-5 grid grid-cols-1 gap-6">
                <div className="bg-[#eff4ff] p-8 rounded-3xl border border-[#c6c6cd]/10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="font-heading text-xl font-bold tracking-tight">Content Creation</h3>
                    <svg className="w-6 h-6 text-[#6b38d4]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67A2.5 2.5 0 0112 22zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8c.28 0 .5-.22.5-.5a.54.54 0 00-.14-.35c-.41-.46-.63-1.05-.63-1.65a2.5 2.5 0 012.5-2.5H16c2.21 0 4-1.79 4-4 0-3.86-3.59-7-8-7z" /></svg>
                  </div>
                  <div className="flex flex-wrap gap-4 mb-6">
                    <div className="bg-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                      <span className="font-medium text-sm">Jasper</span>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                      <span className="font-medium text-sm">Canva</span>
                    </div>
                  </div>
                  <p className="text-sm text-[#45464d] leading-relaxed italic border-l-2 border-[#6b38d4]/20 pl-4">
                    &ldquo;Great at generating assets, but blind to how they actually perform in live auctions.&rdquo;
                  </p>
                </div>
                <div className="bg-[#eff4ff] p-8 rounded-3xl border border-[#c6c6cd]/10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="font-heading text-xl font-bold tracking-tight">Ad Optimization</h3>
                    <svg className="w-6 h-6 text-[#6b38d4]" fill="currentColor" viewBox="0 0 24 24"><path d="M21 8c-1.45 0-2.26 1.44-1.93 2.51l-3.55 3.56c-.3-.09-.74-.09-1.04 0l-2.55-2.55C12.27 10.45 11.46 9 10 9c-1.45 0-2.27 1.44-1.93 2.52l-4.56 4.55C2.44 15.74 1 16.55 1 18c0 1.1.9 2 2 2 1.45 0 2.26-1.44 1.93-2.51l4.55-4.56c.3.09.74.09 1.04 0l2.55 2.55C12.73 16.55 13.54 18 15 18c1.45 0 2.27-1.44 1.93-2.52l3.56-3.55C21.56 12.26 23 11.45 23 10c0-1.1-.9-2-2-2z" /></svg>
                  </div>
                  <div className="flex flex-wrap gap-4 mb-6">
                    <div className="bg-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                      <span className="font-medium text-sm">Madgicx</span>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                      <span className="font-medium text-sm">Ryze</span>
                    </div>
                  </div>
                  <p className="text-sm text-[#45464d] leading-relaxed italic border-l-2 border-[#6b38d4]/20 pl-4">
                    &ldquo;Great at moving budgets, but cannot tell you why a creative failed or how to fix it.&rdquo;
                  </p>
                </div>
              </div>

              {/* Right: Growth OS v2 card */}
              <div className="lg:col-span-7 relative flex items-center justify-center p-8 bg-[#dce9ff] rounded-3xl overflow-hidden min-h-[400px]">
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-[#6b38d4] blur-[120px] rounded-full" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#d0bcff] blur-[100px] rounded-full" />
                </div>
                <div className="relative bg-white/80 backdrop-blur-[20px] p-10 rounded-3xl border border-white/10 shadow-2xl max-w-lg w-full text-center">
                  <div className="mb-6 inline-flex p-4 bg-[#6b38d4]/10 rounded-2xl">
                    <svg className="w-10 h-10 text-[#6b38d4]" fill="currentColor" viewBox="0 0 24 24"><path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z" /></svg>
                  </div>
                  <h2 className="font-heading text-3xl font-extrabold text-[#0b1c30] mb-4">Growth OS v2</h2>
                  <p className="text-[#45464d] text-lg font-medium mb-8 leading-relaxed">
                    The only Orchestrated Intelligence that bridges <span className="text-[#6b38d4] font-bold underline underline-offset-4">Creative Synthesis</span> and <span className="text-[#0b1c30] font-bold underline underline-offset-4">Performance Logic</span>.
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-left">
                    <div className="bg-white/40 p-4 rounded-xl">
                      <span className="block text-[10px] uppercase font-bold text-[#6b38d4] mb-1">Aria</span>
                      <span className="text-xs font-bold text-[#0b1c30]">Creative Feedback Loop</span>
                    </div>
                    <div className="bg-white/40 p-4 rounded-xl">
                      <span className="block text-[10px] uppercase font-bold text-[#0b1c30] mb-1">Scout</span>
                      <span className="text-xs font-bold text-[#0b1c30]">Predictive Diagnostics</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            MULTI-MODEL ROUTING
        ══════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-[#eff4ff]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="font-heading font-extrabold text-4xl mb-6 leading-tight text-[#0b1c30]">
                  Multi-Model Routing &amp;<br />Skills-Based Architecture
                </h2>
                <p className="text-[#45464d] text-lg mb-8">
                  Why use a supercomputer to send an email? Growth OS dynamically routes every task to the most cost-effective model, ensuring premium intelligence without the premium waste.
                </p>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-[#e9ddff] p-2 rounded-lg text-[#6b38d4]">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3h7zM7 9H4V5h3v4zm10 6h3v4h-3v-4zm0-10v4h3V5h-3z" /></svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-[#0b1c30]">Skills-Based Taxonomy</h4>
                      <p className="text-sm text-[#45464d]">Tasks are broken down by expertise, from creative copy to deep data analysis.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-[#d3e4fe] p-2 rounded-lg text-[#0b1c30]">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z" /></svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-[#0b1c30]">Profit-First Routing</h4>
                      <p className="text-sm text-[#45464d]">Automated decisions to use Free, Cheap, Mid, or Premium tiers based on complexity.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tier grid */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { tier: 'Tier 1', name: 'Free', desc: 'Simple formatting & sorting', barWidth: 'w-full', barColor: 'bg-[#c6c6cd]', labelColor: 'text-[#76777d]', highlighted: false },
                  { tier: 'Tier 2', name: 'Cheap', desc: 'Bulk content generation', barWidth: 'w-3/4', barColor: 'bg-[#ffb690]', labelColor: 'text-[#d95f00]', highlighted: false },
                  { tier: 'Tier 3', name: 'Mid', desc: 'Strategic execution & logic', barWidth: 'w-1/2', barColor: 'bg-[#8455ef]', labelColor: 'text-[#6b38d4]', highlighted: false },
                  { tier: 'Tier 4', name: 'Premium', desc: 'Creative mastery & reasoning', barWidth: 'w-1/4', barColor: 'bg-white', labelColor: 'text-[#bcc7de]', highlighted: true },
                ].map((t) => (
                  <div
                    key={t.name}
                    className={`p-6 rounded-2xl flex flex-col justify-between h-48 ${
                      t.highlighted
                        ? 'bg-[#0b1c30] text-white border border-[#3c475a] shadow-xl scale-105'
                        : 'bg-white border border-[#c6c6cd]/10 shadow-sm'
                    }`}
                  >
                    <span className={`text-xs font-bold uppercase tracking-tighter ${t.highlighted ? t.labelColor : t.labelColor}`}>{t.tier}</span>
                    <h3 className="text-xl font-bold">{t.name}</h3>
                    <p className={`text-xs ${t.highlighted ? 'text-[#bcc7de]' : 'text-[#45464d]'}`}>{t.desc}</p>
                    <div className={`h-1 ${t.highlighted ? 'bg-[#3c475a]' : 'bg-[#eff4ff]'} rounded-full overflow-hidden mt-4`}>
                      <div className={`h-full ${t.barColor} ${t.barWidth}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            COMPARISON TABLE
        ══════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-[#f8f9ff]">
          <div className="max-w-7xl mx-auto px-6">
            <header className="mb-16 space-y-4">
              <div className="inline-flex items-center space-x-2 bg-[#e9ddff] text-[#23005c] px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg>
                <span>Market Intelligence</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-heading font-extrabold tracking-tight text-[#0b1c30]">
                Growth OS vs the alternatives
              </h2>
              <p className="text-[#45464d] max-w-2xl text-lg leading-relaxed">
                Traditional solutions focus on reporting. Growth OS v2 focuses on execution. Compare how we stack up against manual agencies and fragmented AI tools.
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-9 bg-[#eff4ff] rounded-[2rem] p-1 overflow-hidden border border-[#c6c6cd]/10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#eff4ff]">
                        <th className="p-8 font-heading text-[#45464d] font-semibold text-xs uppercase tracking-widest">Capabilities</th>
                        <th className="p-8 text-center bg-white rounded-t-2xl shadow-sm">
                          <div className="text-lg font-extrabold font-heading text-[#0b1c30] mb-1">Growth OS v2</div>
                          <div className="text-[10px] text-[#6b38d4] font-bold uppercase tracking-tighter">Autonomous</div>
                        </th>
                        <th className="p-8 text-center"><div className="text-lg font-bold font-heading text-[#45464d] opacity-60">Holo</div></th>
                        <th className="p-8 text-center"><div className="text-lg font-bold font-heading text-[#45464d] opacity-60">Ryze</div></th>
                        <th className="p-8 text-center"><div className="text-lg font-bold font-heading text-[#45464d] opacity-60">Agencies</div></th>
                      </tr>
                    </thead>
                    <tbody className="text-[#0b1c30]">
                      {[
                        { capability: 'Autonomous Manager (Mia)', scores: ['check', 'cancel', 'cancel', 'person'] },
                        { capability: 'AI Search Optimization', scores: ['check', 'check-dim', 'cancel', 'cancel'] },
                        { capability: 'CFO / Unit Economics', scores: ['check', 'cancel', 'cancel', 'cancel'] },
                        { capability: 'Market Diagnosis (Scout)', scores: ['check', 'cancel', 'cancel', 'cancel'] },
                      ].map((row, i) => (
                        <tr key={i} className={i < 3 ? 'border-b border-[#c6c6cd]/10' : ''}>
                          <td className="p-8 font-semibold">{row.capability}</td>
                          {row.scores.map((s, j) => (
                            <td key={j} className={`p-8 text-center ${j === 0 ? (i === 3 ? 'bg-white rounded-b-2xl' : 'bg-white') : ''}`}>
                              {s === 'check' ? (
                                <CheckCircleIcon className="w-8 h-8 text-[#6b38d4] mx-auto" />
                              ) : s === 'check-dim' ? (
                                <CheckCircleIcon className="w-6 h-6 text-[#6b38d4] mx-auto" />
                              ) : s === 'cancel' ? (
                                <CancelIcon className="w-6 h-6 text-[#c6c6cd] mx-auto" />
                              ) : (
                                <div className="flex flex-col items-center">
                                  <PersonIcon className="w-6 h-6 text-[#45464d]/40" />
                                  <span className="text-[10px] text-[#45464d]/40 font-bold uppercase">Human</span>
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sidebar cards */}
              <aside className="lg:col-span-3 space-y-6">
                <div className="bg-white/80 backdrop-blur-[20px] p-6 rounded-3xl border border-[#c6c6cd]/20 shadow-[0_0_20px_rgba(107,56,212,0.15)]">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#6b38d4] flex items-center justify-center text-white">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" /></svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-[#6b38d4]">Mia Insight</p>
                      <p className="font-heading font-bold text-[#0b1c30]">Growth Logic</p>
                    </div>
                  </div>
                  <p className="text-sm text-[#45464d] leading-relaxed italic">
                    &ldquo;While competitors provide vertical tools for specific channels, Growth OS orchestrates the entire growth cycle autonomously.&rdquo;
                  </p>
                </div>
                <div className="bg-[#dce9ff] p-6 rounded-3xl text-[#0b1c30]">
                  <p className="text-xs font-bold text-[#111c2d] mb-2 uppercase tracking-tighter">Profit Margin Impact</p>
                  <div className="text-4xl font-heading font-black mb-1">+42%</div>
                  <p className="text-[10px] opacity-70">Average efficiency gain compared to traditional agency management.</p>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            THE AGENCY PROBLEM
        ══════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-[#eff4ff]">
          <div className="max-w-7xl mx-auto px-6">
            <header className="mb-16">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-[#ffdbca] text-[#341100] rounded-full text-xs font-bold tracking-widest uppercase">The Agency Problem</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-heading font-extrabold tracking-tighter text-[#0b1c30] leading-[1.1] max-w-4xl">
                Agencies cost <span className="text-[#6b38d4]">₹50k to ₹2L+</span> per month for structural inefficiency.
              </h2>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              <div className="md:col-span-7 space-y-6">
                <div className="bg-white rounded-3xl p-8 border border-[#c6c6cd]/10">
                  <div className="flex items-center gap-4 mb-10">
                    <div className="p-3 bg-[#ffdad6] text-[#93000a] rounded-2xl">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" /></svg>
                    </div>
                    <h3 className="text-2xl font-heading font-bold">Hidden Structural Costs</h3>
                  </div>
                  <div className="space-y-8">
                    {[
                      { num: '01', title: 'Account Managers vs. Expertise', desc: 'You pay for a senior expert\'s name but your daily work is delegated to a junior intern with 4 months of experience.' },
                      { num: '02', title: 'No Visibility into Cash Flow', desc: 'Lack of real-time dashboards means you only see where your money went 30 days after it\'s already spent.' },
                      { num: '03', title: 'Weekly Reporting Delays', desc: 'Decisions are made on "last week\'s data" while markets move in milliseconds. Inefficient pivots cost 15-20% ROI.' },
                    ].map((item) => (
                      <div key={item.num} className="flex gap-6">
                        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#dce9ff] flex items-center justify-center font-bold text-[#0b1c30]">{item.num}</div>
                        <div>
                          <h4 className="font-heading font-bold text-lg mb-1">{item.title}</h4>
                          <p className="text-[#45464d] text-sm">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mia Orchestrator card */}
              <div className="md:col-span-5">
                <div className="bg-white/80 backdrop-blur-[20px] rounded-[2rem] border border-white/40 p-8 shadow-2xl relative overflow-hidden">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-full bg-[#0b1c30] flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" /></svg>
                    </div>
                    <div>
                      <span className="block font-heading font-extrabold text-lg">Mia Orchestrator</span>
                      <span className="block text-[#6b38d4] text-xs font-bold uppercase tracking-wider">The Intelligent Alternative</span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="bg-white/60 p-5 rounded-2xl border border-[#c6c6cd]/10">
                      <p className="text-sm font-medium leading-relaxed italic">&ldquo;I&apos;ve detected a 12% drift in efficiency. An agency would notify you next Tuesday. I can reallocate the budget now. Should I proceed?&rdquo;</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#dce9ff] p-4 rounded-2xl">
                        <span className="block text-[10px] font-bold text-[#45464d] mb-1 uppercase">Transparency</span>
                        <span className="text-lg font-bold font-heading">100% Real-time</span>
                      </div>
                      <div className="bg-[#dce9ff] p-4 rounded-2xl">
                        <span className="block text-[10px] font-bold text-[#45464d] mb-1 uppercase">Response</span>
                        <span className="text-lg font-bold font-heading">&lt; 1 Second</span>
                      </div>
                    </div>
                    <Link
                      href="/signup"
                      className="w-full bg-[#0b1c30] text-white py-4 rounded-2xl font-heading font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-xl shadow-black/10"
                    >
                      <span>Replace the Agency Now</span>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z" /></svg>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            MULTI-AGENT WORKFORCE BENTO
        ══════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-[#f8f9ff]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="font-heading font-extrabold text-4xl mb-4 text-[#0b1c30]">A Multi-Agent Workforce</h2>
              <p className="text-[#45464d] max-w-2xl mx-auto text-lg">12 specialized brains, one unified goal: scaling your enterprise. Meet the agents managed by Mia.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Aria — large featured card */}
              <div className="md:col-span-2 md:row-span-2 p-8 rounded-3xl bg-[#6b38d4] text-white relative overflow-hidden flex flex-col justify-end min-h-[400px]">
                <div className="absolute top-0 right-0 p-8">
                  <svg className="w-16 h-16 opacity-20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67A2.5 2.5 0 0112 22z" /></svg>
                </div>
                <div className="relative z-10">
                  <h3 className="font-heading font-bold text-3xl mb-2">Aria</h3>
                  <p className="uppercase tracking-widest text-[#e9ddff] text-xs mb-4">Creative Director</p>
                  <p className="text-[#e9ddff] leading-relaxed">Handles brand voice, visual aesthetics, and creative strategy across all channels.</p>
                  <Link href="/agents" className="mt-6 flex items-center gap-2 text-sm font-bold border-b border-white/30 pb-1 w-fit">See Aria&apos;s Portfolio</Link>
                </div>
              </div>

              {/* Scout */}
              <div className="md:col-span-1 p-6 rounded-3xl bg-[#ffdbca] text-[#341100] flex flex-col justify-between min-h-[180px]">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z" /></svg>
                <div>
                  <h3 className="font-heading font-bold text-xl">Scout</h3>
                  <p className="text-xs uppercase tracking-wider mb-2">Diagnosis</p>
                  <p className="text-sm opacity-80">Identifies market gaps and performance bottlenecks.</p>
                </div>
              </div>

              {/* Max */}
              <div className="md:col-span-1 p-6 rounded-3xl bg-[#dce9ff] text-[#0b1c30] flex flex-col justify-between min-h-[180px]">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 00-2 2v8a2 2 0 002 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" /></svg>
                <div>
                  <h3 className="font-heading font-bold text-xl">Max</h3>
                  <p className="text-xs uppercase tracking-wider mb-2">Budget Manager</p>
                  <p className="text-sm opacity-80">Optimizes ad spend and operational overhead in real-time.</p>
                </div>
              </div>

              {/* Bottom row — smaller agents */}
              <div className="md:col-span-2 grid grid-cols-2 gap-4">
                {[
                  { name: 'Echo', role: 'Social Media' },
                  { name: 'Atlas', role: 'Logistics AI' },
                  { name: 'Sage', role: 'Customer Intel' },
                  { name: 'Nova', role: 'Retention' },
                ].map((a) => (
                  <div key={a.name} className="p-6 rounded-3xl bg-white border border-[#c6c6cd]/10 shadow-sm">
                    <h4 className="font-bold">{a.name}</h4>
                    <p className="text-xs text-[#45464d]">{a.role}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link href="/agents" className="text-[#6b38d4] font-bold flex items-center justify-center gap-2 mx-auto hover:gap-4 transition-all">
                View all 12 agents
                <ArrowForward className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            HOW IT WORKS — DARK SECTION
        ══════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-[#0b1c30] text-white overflow-hidden relative">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="mb-16">
              <h2 className="font-heading font-extrabold text-4xl mb-4">Go Live in 2 Minutes</h2>
              <p className="text-[#bcc7de] text-lg">Sophisticated tech doesn&apos;t have to be complicated.</p>
            </div>
            <div className="grid md:grid-cols-4 gap-12">
              {[
                { num: '01', title: 'Connect Data', desc: 'Sync your store, ads, and warehouse in one click.' },
                { num: '02', title: 'Meet Mia', desc: 'Initialize your Chief of Staff with a brief brand intro.' },
                { num: '03', title: 'Define Goals', desc: 'Tell the agents your targets for ROAS, growth, or margin.' },
                { num: '04', title: 'Deploy Agentic Flows', desc: 'Approve the roadmap and watch the orchestration begin.' },
              ].map((step) => (
                <div key={step.num} className="space-y-4">
                  <div className="text-6xl font-black text-[#8455ef] opacity-50 font-heading">{step.num}</div>
                  <h4 className="text-xl font-bold">{step.title}</h4>
                  <p className="text-sm text-[#bcc7de]">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-20">
              <div className="p-[2px] bg-gradient-to-r from-[#6b38d4] to-transparent rounded-full inline-block">
                <Link
                  href="/signup"
                  className="bg-[#0b1c30] px-12 py-5 rounded-full font-heading font-extrabold text-xl hover:bg-transparent transition-colors block"
                >
                  Start Onboarding
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            FINAL CTA
        ══════════════════════════════════════════════════════════ */}
        <section className="py-24 bg-[#f8f9ff] text-center">
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="font-heading font-extrabold text-5xl mb-6 text-[#0b1c30]">Built for the next generation of D2C founders.</h2>
            <p className="text-xl text-[#45464d] mb-12">Growth OS v2 is more than a platform. It&apos;s the competitive advantage you&apos;ve been waiting for.</p>
            <div className="flex justify-center items-center gap-8 opacity-50 grayscale">
              {['Lumina', 'Vesper', 'Aether', 'Oro'].map((brand) => (
                <span key={brand} className="font-heading font-bold text-2xl text-[#0b1c30]">{brand}</span>
              ))}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
