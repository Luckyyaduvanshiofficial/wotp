import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyButton } from '@/features/landing/components/copy-button';
import { ContributorsSection } from '@/features/landing/components/contributors';
import { DialApparatus } from '@/features/landing/components/dial-apparatus';
import { GITHUB_URL } from '@/features/landing/components/github-star';
import { LiveStarsBadge } from '@/features/landing/components/live-stars-badge';
import { Ruler } from '@/features/landing/components/ruler';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { SiteNav } from '@/features/landing/components/site-nav';
import { Icons } from '@/components/icons';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'WA OTP — Open Source WhatsApp & Telegram OTP Gateway (FastAPI Python)',
  description:
    'Lightning-fast open-source WhatsApp & Telegram OTP gateway built in FastAPI Python. Instant verification, unmetered Telegram delivery, Meta Cloud API integration, and self-hostable.',
  keywords: [
    'Open Source WhatsApp OTP Gateway',
    'FastAPI Python OTP Service',
    'WhatsApp OTP Gateway',
    'Telegram OTP Gateway',
    'Free Telegram OTP',
    'Meta Cloud API WhatsApp OTP',
    'Self Hosted OTP Gateway',
    'India OTP API',
    'Developer Phone Auth'
  ],
  openGraph: {
    title: 'WA OTP — Open Source WhatsApp & Telegram OTP Gateway (FastAPI Python)',
    description:
      'Lightning-fast open-source WhatsApp & Telegram OTP gateway built in FastAPI Python. Free unmetered Telegram delivery and Meta Cloud API integration.',
    url: `${SITE_URL}`,
    siteName: 'WA OTP',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WA OTP — Open Source WhatsApp & Telegram OTP Gateway (FastAPI Python)',
    description:
      'Lightning-fast open-source WhatsApp & Telegram OTP gateway built with FastAPI Python. Free unmetered Telegram bot delivery and Meta WhatsApp Cloud API.'
  }
};

/*
 * Two calls, and that is the whole integration surface — the shapes below are
 * copied verbatim from backend/docs/api.md §1, with the host and key left as
 * shell variables.
 */
const SEND_CALL = `curl -X POST "$WAOTP_API/v1/otp/send" \\
  -H "X-Api-Key: $WAOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210", "channel": "whatsapp"}'`;

const VERIFY_CALL = `curl -X POST "$WAOTP_API/v1/otp/verify" \\
  -H "X-Api-Key: $WAOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210", "code": "123456"}'`;

const STATS = [
  { fig: 'free', label: 'unmetered telegram otp sends' },
  { fig: '100%', label: 'backend & frontend code complete' },
  { fig: '87 / 87', label: 'automated tests passing' }
];

const META_CHALLENGES = [
  {
    key: '01 · official business verification',
    value:
      'meta requires certified government documents (gst registration or certificate of incorporation) matching the legal business entity name to approve a production business manager.'
  },
  {
    key: '02 · international credit card',
    value:
      'meta billing demands an international credit card supporting recurring auto-debit. indian domestic debit cards and rupay cards fail due to rbi e-mandate rules.'
  },
  {
    key: '03 · dedicated phone number',
    value:
      'the production whatsapp number must be a clean sim completely unattached from personal or business whatsapp mobile apps.'
  },
  {
    key: '04 · authentication template review',
    value:
      'custom one-time password templates with copy-code buttons are locked behind full corporate kyc before public delivery is unlocked.'
  }
];

const FACTS = [
  {
    key: 'stack',
    value:
      'lightning-fast fastapi (python 3.12) asynchronous backend and pocketbase database and auth engine, running in a lightweight container.'
  },
  {
    key: 'telegram is live',
    value:
      'telegram otp is 100% active, fast and unmetered. zero corporate hurdles, zero kyc, zero credit cards needed. start building today.'
  },
  {
    key: 'plug your meta account',
    value:
      'if your company already has an approved meta business account, add META_PHONE_NUMBER_ID and META_ACCESS_TOKEN and whatsapp works instantly.'
  },
  {
    key: 'calling contributors & sponsors',
    value:
      'we are looking for open-source contributors or companies willing to sponsor a verified meta business line for the community.'
  }
];

export default function LandingPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'WA OTP',
    applicationCategory: 'SecurityApplication',
    operatingSystem: 'Linux, Docker, Cloud',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    description:
      'Lightning-fast open-source WhatsApp and Telegram OTP gateway built with FastAPI Python. Sub-second delivery, unmetered Telegram bot OTP, and self-hostable.',
    author: {
      '@type': 'Person',
      name: 'Lucky Yaduvanshi',
      url: 'https://luckyyaduvanshi.in/'
    },
    url: `${SITE_URL}`
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
            <span className='inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400'>
              <Icons.whatsapp className='size-3.5' />
              FastAPI Python Gateway
            </span>
            <LiveStarsBadge />
          </div>

          <h1 className='lm-display'>
            <em>send</em> otp on telegram & whatsapp with two api calls.
          </h1>

          <p className='lm-lede'>
            Lightning-fast open-source OTP gateway built with FastAPI Python. Telegram OTP is 100%
            live, unmetered and free. WhatsApp Cloud API is fully implemented and ready to self-host
            or plug in with your Meta Business account.
          </p>

          <div className='lm-actions'>
            <Link href='/signup' className='lm-actions__primary'>
              start free
            </Link>
            <Link href='/dashboard/tester' className='lm-actions__ghost'>
              test in sandbox
            </Link>
            <Link href='/telegram' className='lm-actions__ghost'>
              telegram otp channel ↗
            </Link>
            <Link href='/docs' className='lm-actions__ghost'>
              read the docs
            </Link>
            {GITHUB_URL ? (
              <a href={GITHUB_URL} target='_blank' rel='noreferrer' className='lm-actions__ghost'>
                view on github
              </a>
            ) : null}
          </div>
        </div>
        <div className='lm-hero__foot'>
          <Ruler />
          <DialApparatus />
        </div>
      </header>

      <main>
        <section className='lm-section' id='calls' aria-labelledby='calls-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>02 · how it works</p>
            <h2 className='lm-h2' id='calls-h'>
              one endpoint sends a code. one endpoint checks it.
            </h2>
            <p className='lm-lede'>
              both accept json and return json. your api key travels in the X-Api-Key header, never
              in query parameters, so it remains private and out of logs.
            </p>
          </div>

          <div className='lm-specs'>
            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>post /v1/otp/send</h3>
                <p className='lm-spec__note'>expires_in 300 s</p>
              </div>
              <pre className='lm-code'>{SEND_CALL}</pre>
              <CopyButton value={SEND_CALL} label='copy the send call' />
            </article>

            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>post /v1/otp/verify</h3>
                <p className='lm-spec__note'>verified true</p>
              </div>
              <pre className='lm-code'>{VERIFY_CALL}</pre>
              <CopyButton value={VERIFY_CALL} label='copy the verify call' />
            </article>
          </div>
        </section>

        <section className='lm-section' id='transparency' aria-labelledby='transparency-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>03 · channel status & engineering reality</p>
            <h2 className='lm-h2' id='transparency-h'>
              the code is complete. telegram is live. here is the meta status.
            </h2>
            <p className='lm-lede'>
              we believe in total open-source honesty. the backend and frontend are 100% built,
              tested, and ready. here is where both channels stand right now:
            </p>
          </div>

          <div className='lm-specs'>
            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>telegram channel · 100% live</h3>
                <p className='lm-spec__note'>unmetered & free</p>
              </div>
              <p className='lm-spec__desc text-sm text-muted-foreground'>
                telegram otp works right now with zero corporate friction. no business verification,
                no credit cards, and no per-message fees. users link our bot with one click and
                receive instant codes.{' '}
                <Link href='/telegram' className='text-[var(--color-accent)] underline font-medium'>
                  Explore Telegram OTP landing page →
                </Link>
              </p>
            </article>

            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>whatsapp cloud api · code ready</h3>
                <p className='lm-spec__note'>ready for self-host</p>
              </div>
              <p className='lm-spec__desc text-sm text-muted-foreground'>
                our meta cloud api engine (graph v25.0) is 100% written, tested with live
                deliveries, and supports both sandbox and production templates. self-hosters and
                businesses with a verified meta account can plug credentials in and go live
                immediately.
              </p>
            </article>
          </div>
        </section>

        <section className='lm-section' id='meta-hurdles' aria-labelledby='meta-hurdles-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>04 · meta kyc requirements</p>
            <h2 className='lm-h2' id='meta-hurdles-h'>
              why indie developers hit the meta business wall.
            </h2>
            <p className='lm-lede'>
              to operate a public shared whatsapp line, meta imposes enterprise hurdles documented
              in facebook help doc 159334372093366. here is what makes a community-wide whatsapp
              number challenging without corporate sponsorship:
            </p>
          </div>

          <dl className='lm-facts'>
            {META_CHALLENGES.map(({ key, value }) => (
              <div className='lm-facts__item' key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className='lm-section' id='limits' aria-labelledby='limits-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>05 · numbers & limits</p>
            <h2 className='lm-h2' id='limits-h'>
              unmetered telegram, configurable quotas, audited storage.
            </h2>
            <p className='lm-lede'>
              limits are data, not code. quotas, expiry, attempt thresholds and throttles live in a
              single database row you can tweak without redeploying.
            </p>
          </div>

          <div className='lm-stats'>
            {STATS.map(({ fig, label }) => (
              <div key={label}>
                <p className='lm-stat__fig'>{fig}</p>
                <p className='lm-stat__label'>{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className='lm-section' id='storage' aria-labelledby='storage-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>06 · cryptographic security</p>
            <h2 className='lm-h2' id='storage-h'>
              codes and api keys are hashed. the phone number is not.
            </h2>
            <p className='lm-lede'>
              one-time codes and api keys are stored only as sha256 digests. an operator inspecting
              pocketbase sees hashes, never plaintext secrets. meta and telegram tokens are
              fernet-encrypted at rest. phone numbers remain raw so delivery and verification can be
              matched.
            </p>
          </div>
        </section>

        <section className='lm-section' id='selfhost' aria-labelledby='selfhost-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>07 · self-host & contribute</p>
            <h2 className='lm-h2' id='selfhost-h'>
              100% open source. run it yourself or partner with us.
            </h2>
            <p className='lm-lede'>
              the entire repository is open source under an permissive licence. run it on a $4 vps,
              plug in your company credentials, or help sponsor a production meta line.
            </p>
          </div>

          <dl className='lm-facts'>
            {FACTS.map(({ key, value }) => (
              <div className='lm-facts__item' key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Contributors Section */}
        <ContributorsSection />

        <section className='lm-section lm-section--close' aria-labelledby='start-h'>
          <h2 className='lm-h2' id='start-h'>
            sign up and send your first telegram otp, or clone and self-host.
          </h2>
          <div className='lm-actions'>
            <Link href='/signup' className='lm-actions__primary'>
              start free
            </Link>
            <Link href='/dashboard/tester' className='lm-actions__ghost'>
              test in sandbox
            </Link>
            <Link href='/docs' className='lm-actions__ghost'>
              read the docs
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
