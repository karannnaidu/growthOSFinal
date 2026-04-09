'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Mail, MessageCircle } from 'lucide-react'

const FAQS = [
  {
    q: 'What is Growth OS?',
    a: 'Growth OS is an AI-powered marketing platform for D2C brands. It deploys 12 specialized AI agents to handle everything from ad creative to SEO, email marketing, and analytics — all managed by Mia, your AI Chief of Staff.',
  },
  {
    q: 'How do credits work?',
    a: 'Each AI skill execution costs a certain number of credits based on complexity and the AI model used. Free accounts get 100 one-time credits. Paid plans include monthly credit allocations. You can monitor credit usage from your dashboard.',
  },
  {
    q: 'Which platforms can I connect?',
    a: 'Currently, Growth OS integrates with Shopify (store data), Meta Ads (Facebook & Instagram advertising), and Google Ads (Search, Shopping, Performance Max). More integrations are coming soon.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. We use OAuth for platform connections (read-only where possible), encrypt all data in transit and at rest, and never store your platform passwords. You can revoke access to any connected platform at any time.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes, you can cancel anytime from your dashboard settings. Your account will remain active until the end of your billing period. All your data will be preserved for 30 days after cancellation.',
  },
  {
    q: 'What AI models does Growth OS use?',
    a: 'Growth OS uses a multi-model approach — GPT-4o, Claude, and Gemini — automatically selecting the best model for each task. Premium tiers get access to the most capable models for complex tasks.',
  },
  {
    q: 'How do I get started?',
    a: 'Sign up for a free account, connect your Shopify store, pick your growth focus, and let Mia run an initial diagnosis. The whole onboarding takes under 5 minutes.',
  },
  {
    q: 'Can I use Growth OS for multiple brands?',
    a: 'Yes, Agency plan subscribers can manage multiple brands from a single account. Each brand gets its own knowledge graph, agent configurations, and reporting.',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="font-heading font-semibold text-sm text-white">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 animate-fade-in">
          <p className="text-sm text-white/60 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[#111c2d] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <Link href="/" className="font-heading font-bold text-lg tracking-tight">
          Growth<span className="text-[#6366f1]"> OS</span>
        </Link>
        <Link
          href="/"
          className="text-sm text-white/60 hover:text-white transition-colors"
        >
          Back to Home
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-heading text-4xl font-bold mb-4">Support</h1>
        <p className="text-white/50 mb-12">
          Find answers to common questions or get in touch with our team.
        </p>

        {/* FAQ section */}
        <div className="mb-16">
          <h2 className="font-heading font-semibold text-xl mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQS.map((faq) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>

        {/* Contact section */}
        <div>
          <h2 className="font-heading font-semibold text-xl mb-6">
            Contact Us
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-panel rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#6366f1]/15">
                <Mail className="w-5 h-5 text-[#6366f1]" />
              </div>
              <h3 className="font-heading font-semibold text-base">Email Support</h3>
              <p className="text-sm text-white/50">
                For general inquiries and technical support.
              </p>
              <a
                href="mailto:hello@growthOS.ai"
                className="text-sm text-[#6366f1] hover:text-[#4f52d4] font-medium hover:underline underline-offset-4"
              >
                hello@growthOS.ai
              </a>
            </div>

            <div className="glass-panel rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#10b981]/15">
                <MessageCircle className="w-5 h-5 text-[#10b981]" />
              </div>
              <h3 className="font-heading font-semibold text-base">Live Chat</h3>
              <p className="text-sm text-white/50">
                Available for Growth and Agency plan subscribers.
              </p>
              <p className="text-sm text-white/40">
                Mon-Fri, 9 AM - 6 PM IST
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
