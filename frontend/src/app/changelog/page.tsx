import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/features/landing/components/site-nav';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { GITHUB_URL } from '@/features/landing/components/github-star';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Changelog — WOTP Gateway Releases & Updates',
  description:
    'Every release of WOTP Gateway, the open-source self-hostable WhatsApp and Telegram OTP service. Real tag dates, and what changed in each one.',
  openGraph: {
    title: 'Changelog — WOTP Gateway Releases & Updates',
    description: 'Every release of WOTP Gateway, with what changed in each one.',
    url: `${SITE_URL}/changelog`,
    siteName: 'WOTP',
    type: 'website'
  }
};

// Mirrors CHANGELOG.md at the repository root, which is canonical. Dates are real
// tag dates: 0.1.0 was tagged on 2026-10-01, and the work before it was
// pre-release development on one trunk rather than a series of releases.
const RELEASES: {
  version: string;
  date: string;
  badge?: string;
  title: string;
  groups: { heading: string; items: string[] }[];
}[] = [
  {
    version: 'unreleased',
    date: 'on main',
    title: 'Deployment paths for platforms that build one container at a time',
    groups: [
      {
        heading: 'Deployment',
        items: [
          'Dokploy: a Compose file that joins the platform network so Traefik routes to it, publishes nothing to the host, and names every environment variable instead of relying on an env file the platform never provides.',
          'Dokku: a dashboard image built against the repository root, because Dokku always uses the root as its build context and a Dockerfile written for a subdirectory cannot work there.',
          'Both paths are documented end to end, including the build-time variables that Next.js compiles into the browser bundle and which therefore need a rebuild rather than a restart.'
        ]
      }
    ]
  },
  {
    version: 'v0.1.0',
    date: '1 October 2026',
    badge: 'First Release',
    title: 'The first release: two calls, your own WhatsApp and Telegram accounts',
    groups: [
      {
        heading: 'The API',
        items: [
          'Two endpoints, POST /v1/otp/send and POST /v1/otp/verify. JSON in, JSON out, no SDK, no client library to keep current.',
          'An optional Idempotency-Key header that makes a retry safe, including the one case that matters: the provider accepted the message but the ledger write afterwards failed, where a naive retry would deliver twice.',
          'A documented error contract covering every code, every extra field, and the retry decision for each. Every 429 carries Retry-After, and validation errors never echo raw input back.',
          'Key management — issue, list, rotate and retire — with keys and OTP codes stored as SHA-256 digests only.'
        ]
      },
      {
        heading: 'Channels',
        items: [
          'WhatsApp over your own Meta Cloud API account: authentication templates with a copy-code button, signature-verified delivery callbacks, and per-message delivery status.',
          'Telegram over your own bot: no business verification, no card, no per-message cost, and never counted against the WhatsApp quota.',
          'One-tap Telegram contact linking that accepts a shared number only when it belongs to the person sharing it.'
        ]
      },
      {
        heading: 'Dashboard',
        items: [
          'Overview, API keys, a live OTP tester that generates copyable cURL commands, and a settings view.',
          'A seven-step first-run checklist derived from live readiness rather than asking you to judge your own setup.',
          'A playground that runs the real request and response bodies, the real status codes and the real Retry-After headers locally, with nothing sent anywhere.'
        ]
      },
      {
        heading: 'Security',
        items: [
          'Webhook payloads can no longer reach the control-plane query filter, closing an unauthenticated path from a request body into a query.',
          'Unauthenticated requests are rate-limited, and unknown API keys are cached so a bad key cannot be used to hit the database on every call.',
          'The plaintext API key is never persisted in the browser — it is shown once, and only its hash is stored. Phone numbers are masked in logs.',
          'Every published port is bound to loopback by default, so a default install is not reachable from the network by accident.'
        ]
      },
      {
        heading: 'Reliability',
        items: [
          'Sends are serialized per owner rather than per API key. One owner may hold five keys, so per-key locking let a single owner exceed the monthly cap several times over.',
          'Quota counts immutable usage, recorded once at send time. A counter that drops when messages later succeed is not a spend limit.',
          'In-process lock pools are bounded, so a stream of distinct numbers cannot grow them without limit.'
        ]
      },
      {
        heading: 'Operations',
        items: [
          'A three-container stack — API, PocketBase and dashboard — running as non-root, with one SQLite file to back up.',
          'Two health endpoints: liveness, and readiness that reports provider state by variable name and never by value, so it is safe to read in public.',
          'Retention pruning for OTP codes and audit rows, with a dry-run preview, plus request ids so a log line can be traced to the request that produced it.',
          'CI running the backend suite, the frontend checks, a full-history secret scan and dependency audits, against pinned dependencies.'
        ]
      },
      {
        heading: 'Discoverability',
        items: [
          'WhatsApp and Telegram landing pages, a sitemap, robots rules, OpenGraph and Twitter card images, schema markup and a PWA manifest.',
          'An instrument display face subset from 3.6 MB to 84 KB, on stat figures only — a dot-matrix face turns to mush below display size.',
          'Privacy, terms and disclaimer pages.'
        ]
      }
    ]
  }
];

export default function ChangelogPage() {
  return (
    <div className='lm lm-shell'>
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-hero'>
        <div className='lm-hero__body'>
          <p className='lm-eyebrow'>release log · version history</p>
          <h1 className='lm-display'>
            <em>changelog</em> & product updates.
          </h1>
          <p className='lm-lede'>
            Every release of WOTP Gateway, with the work that went into it. Real tag dates, and one
            version released so far — the project is new, and this page grows as it does.
          </p>
          <div className='lm-actions'>
            <Link href='/docs' className='lm-actions__primary'>
              self-host it
            </Link>
            {GITHUB_URL ? (
              <a
                href={`${GITHUB_URL}/releases`}
                target='_blank'
                rel='noreferrer'
                className='lm-actions__ghost'
              >
                github releases
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main>
        <section className='lm-section' id='timeline' aria-labelledby='timeline-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>releases</p>
            <h2 className='lm-h2' id='timeline-h'>
              evolution of the gateway.
            </h2>
          </div>

          <div className='space-y-8 pt-4'>
            {RELEASES.map((rel) => (
              <article
                key={rel.version}
                className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-6 sm:p-8 space-y-4'
              >
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] pb-4'>
                  <div className='flex items-center gap-3'>
                    <span className='font-mono font-bold text-lg text-[var(--color-ink)]'>
                      {rel.version}
                    </span>
                    {rel.badge ? (
                      <span className='rounded bg-[var(--rule)] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]'>
                        {rel.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className='font-mono text-xs text-[var(--color-ink-muted)]'>
                    {rel.date}
                  </span>
                </div>

                <h3 className='font-semibold text-base sm:text-lg text-[var(--color-ink)]'>
                  {rel.title}
                </h3>

                <div className='space-y-5 pt-1'>
                  {rel.groups.map((group) => (
                    <div key={group.heading} className='space-y-2.5'>
                      <p className='font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]'>
                        {group.heading}
                      </p>
                      <ul className='space-y-2.5 text-xs sm:text-sm text-[var(--color-ink-muted)]'>
                        {group.items.map((item, idx) => (
                          <li key={idx} className='flex items-start gap-2.5'>
                            <span className='text-[var(--color-accent)] mt-1 font-mono text-xs'>
                              ✓
                            </span>
                            <span className='leading-relaxed'>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <p className='pt-8 text-xs text-[var(--color-ink-muted)]'>
            This page mirrors{' '}
            {GITHUB_URL ? (
              <a
                href={`${GITHUB_URL}/blob/main/CHANGELOG.md`}
                target='_blank'
                rel='noreferrer'
                className='underline'
              >
                CHANGELOG.md
              </a>
            ) : (
              'CHANGELOG.md'
            )}
            , which is the canonical record.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
