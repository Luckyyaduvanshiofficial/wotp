import type { Metadata } from 'next';
import { SiteNav } from '@/features/landing/components/site-nav';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms & Conditions — WOTP Gateway',
  description:
    'Terms of Service and Conditions for WOTP Gateway. Fair usage guidelines, open-source rights, and acceptable use policies.',
  openGraph: {
    title: 'Terms & Conditions — WOTP Gateway',
    description: 'Terms of Service for WOTP Gateway.',
    url: `${SITE_URL}/terms`,
    siteName: 'WOTP',
    type: 'website'
  }
};

export default function TermsPage() {
  return (
    <div className='lm lm-shell'>
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-hero'>
        <div className='lm-hero__body'>
          <p className='lm-eyebrow'>legal & agreements</p>
          <h1 className='lm-display'>
            <em>terms</em> & conditions.
          </h1>
          <p className='lm-lede'>
            Developer-friendly, transparent terms. Permissive open-source licensing, straightforward
            fair use, and zero hidden lock-in.
          </p>
          <p className='text-xs font-mono text-[var(--color-ink-faint)]'>
            Last updated: September 2026
          </p>
        </div>
      </header>

      <main>
        <section className='lm-section' id='terms' aria-labelledby='terms-h'>
          <div className='max-w-3xl space-y-8 text-xs sm:text-sm text-[var(--color-ink-muted)] leading-relaxed'>
            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                1. Acceptance of Terms
              </h2>
              <p>
                By accessing or utilizing the WOTP API, dashboard, or associated services provided
                by CodaiPro, you agree to be bound by these Terms and Conditions. If you disagree
                with any portion of these terms, your sole remedy is to cease using the hosted
                platform or self-host the open-source software under its repository license.
              </p>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                2. Acceptable Use & Prohibited Conduct
              </h2>
              <p>
                WOTP is built for legitimate user verification, registration authentication, and
                login challenges. You agree NOT to:
              </p>
              <ul className='list-disc pl-5 space-y-1.5'>
                <li>
                  Use the API to transmit unsolicited commercial communications, phishing attacks,
                  or spam.
                </li>
                <li>
                  Conduct denial-of-service attacks, OTP bombing, or intentional harassment of
                  recipients.
                </li>
                <li>
                  Attempt to reverse-engineer, bypass rate limits, or exploit authentication
                  endpoints.
                </li>
                <li>
                  Violate Meta Platforms&apos; WhatsApp Business Policies or Telegram&apos;s Terms
                  of Service.
                </li>
              </ul>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                3. Rate Limiting & Service Quotas
              </h2>
              <p>
                To preserve system availability for all developers, the hosted platform enforces
                automated rate limits (30 requests/minute per IP, 10 requests/minute per API key,
                and 5 OTPs/hour per phone number). Accounts exhibiting malicious abuse patterns may
                have their API keys deactivated immediately.
              </p>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                4. Open-Source Rights & Self-Hosting
              </h2>
              <p>
                The underlying source code of WOTP is distributed as free and open-source software.
                You are free to inspect, modify, fork, and self-host the application on your own
                servers in compliance with the repository license.
              </p>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                5. Disclaimer of Warranties & Limitation of Liability
              </h2>
              <p>
                The service is provided &quot;AS IS&quot; without warranties of any kind, whether
                express or implied. Under no circumstances shall the author (Lucky Yaduvanshi) or
                CodaiPro be liable for any indirect, incidental, special, or consequential damages
                resulting from downtime, delivery failures, or provider outages.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
