import type { Metadata } from 'next';
import { SiteNav } from '@/features/landing/components/site-nav';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy Policy — WA OTP Gateway',
  description:
    'Privacy Policy for WA OTP Gateway. We believe in privacy by design: zero data selling, SHA-256 hashed OTPs, and Fernet-encrypted credentials.',
  openGraph: {
    title: 'Privacy Policy — WA OTP Gateway',
    description: 'Privacy Policy for WA OTP Gateway. Privacy by design, zero data selling.',
    url: `${SITE_URL}/privacy`,
    siteName: 'WA OTP',
    type: 'website'
  }
};

export default function PrivacyPolicyPage() {
  return (
    <div className='lm lm-shell'>
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-hero'>
        <div className='lm-hero__body'>
          <p className='lm-eyebrow'>legal & trust</p>
          <h1 className='lm-display'>
            <em>privacy</em> policy.
          </h1>
          <p className='lm-lede'>
            Privacy by design. We never sell your data, we hash your OTP codes with SHA-256, and
            self-hosters retain 100% data sovereignty on their own servers.
          </p>
          <p className='text-xs font-mono text-[var(--color-ink-faint)]'>
            Last updated: September 2026
          </p>
        </div>
      </header>

      <main>
        <section className='lm-section' id='policy' aria-labelledby='policy-h'>
          <div className='max-w-3xl space-y-8 text-xs sm:text-sm text-[var(--color-ink-muted)] leading-relaxed'>
            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                1. Overview & Commitment
              </h2>
              <p>
                WA OTP (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;) is an
                open-source WhatsApp and Telegram OTP Gateway created by Lucky Yaduvanshi and hosted
                under CodaiPro. We respect the privacy of developers, operators, and their
                end-users. We do not sell, rent, or monetize personal data.
              </p>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                2. Information Processed
              </h2>
              <p>
                When using the hosted gateway or integrating via our API, we process only the
                minimum information necessary to execute two-factor authentication:
              </p>
              <ul className='list-disc pl-5 space-y-1.5'>
                <li>
                  <strong>Phone Number / Telegram Chat ID:</strong> Used solely to dispatch the
                  requested OTP via the Meta Cloud API or Telegram Bot API.
                </li>
                <li>
                  <strong>One-Time Password (OTP) Codes:</strong> Cryptographically generated and
                  stored exclusively as a SHA-256 hash. Plaintext codes are never written to the
                  database.
                </li>
                <li>
                  <strong>Account Credentials:</strong> Developer email and hashed password stored
                  securely in PocketBase for dashboard access.
                </li>
                <li>
                  <strong>API Usage Logs:</strong> Timestamps, delivery status codes, channel used,
                  and request IDs for rate-limiting and audit trails.
                </li>
              </ul>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                3. Cryptographic Storage & Security
              </h2>
              <p>Security is implemented at the database layer:</p>
              <ul className='list-disc pl-5 space-y-1.5'>
                <li>
                  <strong>Hashed OTPs:</strong> An operator inspecting the database can only view
                  SHA-256 digests. Even in the event of unauthorized database access, OTP codes
                  cannot be reversed.
                </li>
                <li>
                  <strong>Single-Use Burn:</strong> Once verified, an OTP code is immediately marked
                  as burned and cannot be reused.
                </li>
                <li>
                  <strong>Auto-Invalidation:</strong> Issuing a new OTP to a phone number
                  automatically invalidates any existing active codes for that number.
                </li>
                <li>
                  <strong>Encrypted Tokens:</strong> Meta and Telegram provider tokens are
                  Fernet-encrypted at rest using a 32-byte master key.
                </li>
              </ul>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                4. Data Retention
              </h2>
              <p>
                OTP codes automatically expire after 300 seconds (5 minutes). Delivery logs are
                retained temporarily for troubleshooting and rate limiting. Users may delete their
                account and associated API keys at any time through the dashboard.
              </p>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                5. Self-Hosted Installations
              </h2>
              <p>
                When you deploy WA OTP via Docker Compose on your own server, zero telemetry or data
                is transmitted to our servers. You maintain 100% ownership, governance, and control
                of your database, logs, and user communications.
              </p>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>6. Contact</h2>
              <p>
                For questions regarding this privacy policy or data security practices, contact the
                maintainer at{' '}
                <a
                  href='https://luckyyaduvanshi.in/'
                  target='_blank'
                  rel='noreferrer'
                  className='text-[var(--color-accent)] underline'
                >
                  luckyyaduvanshi.in
                </a>{' '}
                or via the CodaiPro team at{' '}
                <a
                  href='https://codaipro.com/'
                  target='_blank'
                  rel='noreferrer'
                  className='text-[var(--color-accent)] underline'
                >
                  codaipro.com
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
