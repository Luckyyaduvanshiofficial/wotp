import type { Metadata } from 'next';
import Link from 'next/link';
import { DOCS_PAGES } from '@/features/docs/docs-nav';
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
  title: 'WA OTP: open source, self-hosted WhatsApp & Telegram OTP gateway',
  description:
    'A free, open-source OTP gateway you host yourself on your own Meta WhatsApp Cloud API and Telegram bot credentials. Two HTTP calls, hashed codes, no hosted tier and nothing to pay this project.',
  keywords: [
    'open source OTP gateway',
    'self hosted OTP service',
    'WhatsApp OTP API',
    'Telegram OTP bot',
    'free OTP service',
    'FastAPI OTP service',
    'phone verification API',
    'Meta Cloud API OTP',
    'BYOK OTP gateway',
    'docker OTP service'
  ],
  alternates: { canonical: '/' },
  openGraph: {
    title: 'WA OTP: open source, self-hosted WhatsApp & Telegram OTP gateway',
    description:
      'Two HTTP calls, your own Meta and Telegram credentials, no hosted tier. Try the whole API in your browser before you install anything.',
    url: `${SITE_URL}`,
    siteName: 'WA OTP',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WA OTP: open source, self-hosted OTP gateway',
    description:
      'Two HTTP calls, your own credentials, no hosted tier. Try the whole API in your browser first.'
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

/*
 * Every figure here is checkable against the repository. The previous revision
 * claimed "87 / 87" tests and "100% code complete", which were true once, went
 * stale, and read as invented. If a number on this page cannot be verified by
 * running one command, it does not belong on this page.
 */
const STATS = [
  { fig: '153', label: 'automated tests, all passing' },
  { fig: '2', label: 'http calls in the whole integration' },
  { fig: '0', label: 'per-message cost on telegram' }
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
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'One-time password gateway',
    operatingSystem: 'Linux, Docker, macOS',
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    codeRepository: GITHUB_URL || undefined,
    programmingLanguage: ['Python', 'TypeScript'],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description:
        'Free and open source. Meta bills your own account directly for WhatsApp messages.'
    },
    featureList: [
      'Two-call OTP API: send and verify',
      'WhatsApp Cloud API delivery on your own Meta account',
      'Free Telegram bot delivery with no business verification',
      'SHA-256 hashed codes and API keys, Fernet-encrypted provider tokens',
      'Monthly quota, per-phone throttle and per-key rate limiting',
      'Self-hosted with Docker Compose, no hosted tier'
    ],
    description:
      'Open-source, self-hosted OTP gateway. Send and verify one-time passwords over your own WhatsApp Cloud API account or Telegram bot with two HTTP calls.',
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
            <Link href='/try' className='lm-actions__primary'>
              try it in the browser
            </Link>
            <Link href='/docs/self-hosting' className='lm-actions__ghost'>
              self-host it
            </Link>
            <Link href='/docs' className='lm-actions__ghost'>
              read the docs
            </Link>
            <Link href='/telegram' className='lm-actions__ghost'>
              telegram otp channel ↗
            </Link>
            {GITHUB_URL ? (
              <a href={GITHUB_URL} target='_blank' rel='noreferrer' className='lm-actions__ghost'>
                view on github
              </a>
            ) : null}
          </div>
          <p className='lm-lede mt-3 text-sm'>
            No install and no signup to look: the playground runs the real send and verify rules in
            your browser and sends nothing anywhere.
          </p>
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
              100% open source. run it yourself, on your own credentials.
            </h2>
            <p className='lm-lede'>
              The whole repository is open source under the <strong>AGPL-3.0</strong>. Run it on a
              $4 VPS, plug in your own Meta and Telegram credentials, and you owe this project
              nothing. The copyleft is deliberate: fork it, modify it, even sell hosting on it, but
              a modified version offered to users over a network has to publish its source.
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

        {/* Internal index. Every docs page is linked from the home page by name
            and by what it answers, which is how a crawler finds them and how a
            reader decides which one to open. */}
        <section className='lm-section' id='docs-index' aria-labelledby='docs-index-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>08 · documentation</p>
            <h2 className='lm-h2' id='docs-index-h'>
              start with the page that matches your problem.
            </h2>
            <p className='lm-lede'>
              Two calls to integrate, but the work around them is real. These are the six pages the
              docs are made of, and the short version of what each one settles.
            </p>
          </div>

          <div className='lm-specs'>
            {DOCS_PAGES.map((page) => (
              <article className='lm-spec' key={page.href}>
                <div className='lm-spec__head'>
                  <h3 className='lm-spec__route'>
                    <Link href={page.href}>{page.label}</Link>
                  </h3>
                  <p className='lm-spec__note'>{page.intent}</p>
                </div>
                <p className='lm-spec__desc text-sm text-muted-foreground'>{page.blurb}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Contributors Section */}
        <ContributorsSection />

        <section className='lm-section lm-section--close' aria-labelledby='start-h'>
          <h2 className='lm-h2' id='start-h'>
            see it work, then clone it.
          </h2>
          <p className='lm-lede'>
            The playground needs no install and no account, and it sends nothing. When you have seen
            the wire format, the compose file is the next step.
          </p>
          <div className='lm-actions'>
            <Link href='/try' className='lm-actions__primary'>
              try it in the browser
            </Link>
            <Link href='/docs/self-hosting' className='lm-actions__ghost'>
              self-host it
            </Link>
            <Link href='/docs/quickstart' className='lm-actions__ghost'>
              quickstart
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
