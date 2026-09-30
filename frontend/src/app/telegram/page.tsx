import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyButton } from '@/features/landing/components/copy-button';
import { ContributorsSection } from '@/features/landing/components/contributors';
import { GITHUB_URL } from '@/features/landing/components/github-star';
import { LiveStarsBadge } from '@/features/landing/components/live-stars-badge';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { SiteNav } from '@/features/landing/components/site-nav';
import { Icons } from '@/components/icons';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Free Telegram OTP Gateway — Lightning Fast & Unmetered Verification (FastAPI Python)',
  description:
    'Deliver instant one-time passwords via Telegram Bot API with zero per-message fees, no Meta corporate KYC, and lightning-fast FastAPI Python speed. 100% free, unmetered, and open source.',
  keywords: [
    'Telegram OTP Gateway',
    'Telegram Bot OTP',
    'Free OTP Gateway',
    'Unmetered OTP Delivery',
    'FastAPI Python Telegram OTP',
    'Open Source OTP',
    'Telegram Two Factor Authentication',
    'Self Hosted Telegram OTP',
    'Developer Phone Auth'
  ],
  openGraph: {
    title: 'Free Telegram OTP Gateway — Lightning Fast & Unmetered Verification',
    description:
      'Deliver instant one-time passwords via Telegram Bot API with zero fees, no Meta KYC, and lightning-fast FastAPI Python speed. 100% free and unmetered.',
    url: `${SITE_URL}/telegram`,
    siteName: 'WA OTP',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Telegram OTP Gateway — Lightning Fast & Unmetered Verification',
    description:
      'Deliver instant one-time passwords via Telegram Bot API with zero fees, no Meta KYC, and lightning-fast FastAPI Python speed.'
  }
};

const SEND_TELEGRAM_CALL = `curl -X POST "$WAOTP_API/v1/otp/send" \\
  -H "X-Api-Key: $WAOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210", "channel": "telegram"}'`;

const VERIFY_TELEGRAM_CALL = `curl -X POST "$WAOTP_API/v1/otp/verify" \\
  -H "X-Api-Key: $WAOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210", "code": "123456"}'`;

const TELEGRAM_STATS = [
  { fig: '₹0', label: 'cost per otp message — free forever' },
  { fig: '< 1s', label: 'lightning delivery via telegram bot api' },
  { fig: '0 KYC', label: 'no corporate paperwork or credit card' },
  { fig: '100%', label: 'inbox delivery without dnd or spam filters' }
];

const COMPARISON = [
  {
    feature: 'Cost per OTP',
    telegram: 'Free Forever (₹0 / $0)',
    whatsapp: '₹0.35 – ₹0.75+ per OTP',
    sms: '₹0.15 – ₹0.40 per SMS'
  },
  {
    feature: 'Setup & Verification',
    telegram: 'Instant (Create Bot via @BotFather in 2 min)',
    whatsapp: 'Weeks (Corporate GST, Bank Card, Meta Review)',
    sms: 'Weeks (DLT registration, Template approvals)'
  },
  {
    feature: 'Delivery Rate',
    telegram: '100% Direct Bot Push (Zero carrier drops)',
    whatsapp: '98% (Subject to WhatsApp account status)',
    sms: '82% – 90% (Delayed by telecom queues, DND)'
  },
  {
    feature: 'Carrier DND Filtering',
    telegram: 'Never blocked (Direct app push notification)',
    whatsapp: 'Bypasses SMS DND',
    sms: 'Frequently delayed or blocked by telecom DND'
  },
  {
    feature: 'Global Reach',
    telegram: 'Over 950M+ active users worldwide',
    whatsapp: '2B+ active users',
    sms: 'Global (Subject to international roaming tariffs)'
  }
];

export default function TelegramLandingPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'WA OTP - Telegram OTP Gateway',
    applicationCategory: 'SecurityApplication',
    operatingSystem: 'Linux, Docker, Cloud',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    description:
      'Lightning-fast open-source Telegram Bot OTP gateway built with FastAPI Python. Zero message fees, unmetered delivery, and complete self-hostability.',
    author: {
      '@type': 'Person',
      name: 'Lucky Yaduvanshi',
      url: 'https://luckyyaduvanshi.in/'
    },
    url: `${SITE_URL}/telegram`
  };

  return (
    <div className='lm lm-shell'>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-hero'>
        <div className='lm-hero__body'>
          <div className='flex items-center gap-3 pb-2'>
            <span className='inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 font-mono text-[11px] font-semibold text-sky-600 dark:text-sky-400'>
              <Icons.telegram className='size-3.5' />
              Telegram Bot Channel
            </span>
            <LiveStarsBadge />
          </div>

          <h1 className='lm-display'>
            <em>deliver</em> unmetered otp on telegram with lightning speed.
          </h1>

          <p className='lm-lede'>
            Skip expensive SMS gateway contracts, telecom DND blocks, and Meta corporate KYC
            hurdles. Send one-time passwords through Telegram Bot API with sub-second delivery, zero
            per-message charges, and an asynchronous FastAPI Python backend.
          </p>

          <div className='lm-actions'>
            <Link href='/docs' className='lm-actions__primary'>
              self-host it
            </Link>
            <Link href='/try' className='lm-actions__ghost'>
              try it in the browser
            </Link>
            <Link href='/docs' className='lm-actions__ghost'>
              api docs
            </Link>
            {GITHUB_URL ? (
              <a href={GITHUB_URL} target='_blank' rel='noreferrer' className='lm-actions__ghost'>
                view on github
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main>
        {/* Telegram Stats */}
        <section className='lm-section' id='stats' aria-labelledby='stats-h'>
          <div className='lm-stats'>
            {TELEGRAM_STATS.map(({ fig, label }) => (
              <div key={label}>
                <p className='lm-stat__fig text-sky-600 dark:text-sky-400'>{fig}</p>
                <p className='lm-stat__label'>{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Integration API Calls */}
        <section className='lm-section' id='telegram-api' aria-labelledby='telegram-api-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>02 · integration surface</p>
            <h2 className='lm-h2' id='telegram-api-h'>
              two restful calls to dispatch and verify.
            </h2>
            <p className='lm-lede'>
              Pass <code>channel: &quot;telegram&quot;</code> in your request payload. The gateway
              sends an authenticated bot message containing a time-limited 6-digit PIN and returns
              an expiry window.
            </p>
          </div>

          <div className='lm-specs'>
            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>post /v1/otp/send · telegram</h3>
                <p className='lm-spec__note'>expires in 300 s</p>
              </div>
              <pre className='lm-code'>{SEND_TELEGRAM_CALL}</pre>
              <CopyButton value={SEND_TELEGRAM_CALL} label='copy send telegram call' />
            </article>

            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>post /v1/otp/verify · telegram</h3>
                <p className='lm-spec__note'>verified true</p>
              </div>
              <pre className='lm-code'>{VERIFY_TELEGRAM_CALL}</pre>
              <CopyButton value={VERIFY_TELEGRAM_CALL} label='copy verify call' />
            </article>
          </div>
        </section>

        {/* Channel Comparison */}
        <section className='lm-section' id='comparison' aria-labelledby='comparison-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>03 · comparison</p>
            <h2 className='lm-h2' id='comparison-h'>
              why telegram otp is the developer&apos;s secret weapon.
            </h2>
            <p className='lm-lede'>
              Traditional SMS gateways charge high per-message fees, impose regulatory templates,
              and fail on DND lines. Telegram Bot OTP provides an unmetered, instant, zero-cost
              alternative for apps and side projects.
            </p>
          </div>

          <div className='overflow-x-auto rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)]'>
            <table className='w-full text-left text-xs font-mono'>
              <thead>
                <tr className='border-b border-[var(--rule)] bg-[var(--rule)]/30 text-[var(--color-ink)]'>
                  <th className='p-3.5 sm:p-4 uppercase tracking-wider'>Feature</th>
                  <th className='p-3.5 sm:p-4 uppercase tracking-wider text-sky-600 dark:text-sky-400 font-bold'>
                    Telegram Bot OTP
                  </th>
                  <th className='p-3.5 sm:p-4 uppercase tracking-wider text-[var(--color-ink-muted)]'>
                    WhatsApp Cloud API
                  </th>
                  <th className='p-3.5 sm:p-4 uppercase tracking-wider text-[var(--color-ink-muted)]'>
                    Traditional SMS
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-[var(--rule)]'>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className='hover:bg-[var(--rule)]/10 transition-colors'>
                    <td className='p-3.5 sm:p-4 font-semibold text-[var(--color-ink)]'>
                      {row.feature}
                    </td>
                    <td className='p-3.5 sm:p-4 font-bold text-sky-600 dark:text-sky-400'>
                      {row.telegram}
                    </td>
                    <td className='p-3.5 sm:p-4 text-[var(--color-ink-muted)]'>{row.whatsapp}</td>
                    <td className='p-3.5 sm:p-4 text-[var(--color-ink-muted)]'>{row.sms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* How Telegram Bot Linking Works */}
        <section className='lm-section' id='bot-flow' aria-labelledby='bot-flow-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>04 · user experience</p>
            <h2 className='lm-h2' id='bot-flow-h'>
              frictionless bot pairing in 3 seconds.
            </h2>
            <p className='lm-lede'>
              How your end-users receive their one-time code on Telegram without entering their
              password or revealing private credentials.
            </p>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-6 pt-2'>
            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-5 space-y-2'>
              <span className='flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 font-mono text-sm font-bold'>
                1
              </span>
              <h3 className='font-semibold text-sm text-[var(--color-ink)]'>One-Click Bot Start</h3>
              <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                User taps your app&apos;s Telegram link (`t.me/your_otp_bot?start=auth`). Telegram
                opens directly on their mobile device or desktop.
              </p>
            </div>

            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-5 space-y-2'>
              <span className='flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 font-mono text-sm font-bold'>
                2
              </span>
              <h3 className='font-semibold text-sm text-[var(--color-ink)]'>
                Instant Push Notification
              </h3>
              <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                The gateway sends the formatted OTP message containing the single-use numeric code
                within 400 milliseconds.
              </p>
            </div>

            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-5 space-y-2'>
              <span className='flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 font-mono text-sm font-bold'>
                3
              </span>
              <h3 className='font-semibold text-sm text-[var(--color-ink)]'>
                Single-Use Verification
              </h3>
              <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                User enters the code into your app. The code is verified and immediately burned from
                the database to prevent replay attacks.
              </p>
            </div>
          </div>
        </section>

        {/* Contributors Section */}
        <ContributorsSection />

        {/* Closing CTA */}
        <section className='lm-section lm-section--close' aria-labelledby='start-h'>
          <div className='lm-head'>
            <h2 className='lm-h2' id='start-h'>
              start sending unmetered telegram otps today.
            </h2>
            <p className='lm-lede'>
              Clone the repository and self-host on your own infrastructure, or try the sandbox
              first. There is no hosted account to create — the software runs on your machine, with
              your own Telegram bot.
            </p>
          </div>
          <div className='lm-actions'>
            <Link href='/docs' className='lm-actions__primary'>
              self-host it
            </Link>
            <Link href='/try' className='lm-actions__ghost'>
              try it in the browser
            </Link>
            <Link href='/docs' className='lm-actions__ghost'>
              read documentation
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
