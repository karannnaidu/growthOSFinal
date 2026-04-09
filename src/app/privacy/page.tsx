import Link from 'next/link'

export default function PrivacyPage() {
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
        <h1 className="font-heading text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-sm text-white/40 mb-10">Last updated: April 9, 2026</p>

        <div className="space-y-8">
          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="font-heading font-semibold text-lg">1. Information We Collect</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              We collect information you provide directly, including your name, email address,
              store URL, and payment information. We also collect usage data such as skill runs,
              agent interactions, and platform analytics to improve the Service.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="font-heading font-semibold text-lg">2. How We Use Your Data</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Your data is used to provide and improve the Service, personalize AI agent outputs,
              process payments, send service communications, and ensure platform security.
              We do not sell your personal data to third parties.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="font-heading font-semibold text-lg">3. Data Storage and Security</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Your data is stored securely using Supabase (hosted on AWS). We use encryption
              in transit (TLS) and at rest. OAuth tokens for connected platforms are encrypted
              and stored separately from general application data. We conduct regular security
              audits and follow industry best practices.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="font-heading font-semibold text-lg">4. Third-Party Services</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Growth OS integrates with third-party services including Shopify, Meta Ads,
              Google Ads, and AI model providers (OpenAI, Anthropic, Google). Data shared with
              these providers is governed by their respective privacy policies. We only share
              the minimum data necessary for service operation.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="font-heading font-semibold text-lg">5. Your Rights</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              You have the right to access, correct, or delete your personal data at any time.
              You may export your data from the dashboard exports page. To request account
              deletion, contact us at the email below. We will process your request within 30 days.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="font-heading font-semibold text-lg">6. Cookies</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              We use essential cookies for authentication and session management. We do not
              use third-party tracking cookies. Analytics data is collected in aggregate and
              anonymized form.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="font-heading font-semibold text-lg">7. Changes to This Policy</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any
              changes by posting the new policy on this page and updating the &ldquo;Last updated&rdquo; date.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="font-heading font-semibold text-lg">8. Contact</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              For questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:privacy@growthOS.ai" className="text-[#6366f1] hover:underline">
                privacy@growthOS.ai
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
