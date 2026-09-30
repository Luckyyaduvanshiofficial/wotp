import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/features/landing/components/site-nav';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { GITHUB_URL } from '@/features/landing/components/github-star';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Changelog — WA OTP Gateway Releases & Updates',
  description:
    'Track updates, improvements, and new feature releases for WA OTP Gateway. Open source, self-hostable, and built with FastAPI Python.',
  openGraph: {
    title: 'Changelog — WA OTP Gateway Releases & Updates',
    description: 'Track updates, improvements, and releases for WA OTP Gateway.',
    url: `${SITE_URL}/changelog`,
    siteName: 'WA OTP',
    type: 'website'
  }
};

const RELEASES = [
  {
    version: 'v0.3.0',
    date: 'September 2026',
    badge: 'Latest Release',
    title: 'Responsive OTP Tester, Telegram Channel Hub & Enhanced SEO',
    highlights: [
      'Dedicated Telegram OTP Gateway landing page detailing unmetered zero-cost bot delivery and comparison with traditional SMS.',
      'Responsive dual-column OTP tester console with live cURL command generation and password visibility toggle.',
      'Modernized Settings view with one-click Account ID copying, profile updates, and tester cache reset.',
      'Complete search engine optimization suite: dynamic sitemap.xml, robots.txt, OpenGraph, Twitter Cards, and schema markup.',
      'Live GitHub stars badge and community contributors showcase.',
      'Temp Mail companion tool integration for testing authentication without real emails.'
    ]
  },
  {
    version: 'v0.2.0',
    date: 'August 2026',
    badge: 'Major Architecture',
    title: 'Self-Hosted Gateway Architecture, Provider Decoupling & Crypto Hardening',
    highlights: [
      'Decoupled WhatsAppProvider abstraction interface supporting Meta Cloud API and Telegram Bot API.',
      '100% Open-Source self-hostable release with single-command Docker Compose stack and non-root containers.',
      'Hashed OTP storage: all one-time passwords and API keys are stored strictly as SHA-256 digests.',
      'Automatic invalidation of existing active OTP codes whenever a resend is requested for the same phone number.',
      'Multi-tier rate limiting: 30 req/min per IP, 10 req/min per API key, 5 OTPs/hour per recipient.',
      'First-run 7-step onboarding checklist wizard deriving live readiness from /health/ready.'
    ]
  },
  {
    version: 'v0.1.0',
    date: 'July 2026',
    badge: 'Initial Release',
    title: 'FastAPI Python Engine & PocketBase Control Plane',
    highlights: [
      'High-throughput asynchronous backend built with FastAPI (Python 3.12).',
      'PocketBase single-binary embedded auth and database engine.',
      'Two RESTful endpoints: POST /v1/otp/send and POST /v1/otp/verify.',
      'Full test suite with 87 unit and integration tests under mock delivery mode.'
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
            Every feature, improvement, and architectural refinement made to WA OTP Gateway. Built
            with transparency in the open source ecosystem.
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
                    <span className='rounded bg-[var(--rule)] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]'>
                      {rel.badge}
                    </span>
                  </div>
                  <span className='font-mono text-xs text-[var(--color-ink-muted)]'>
                    {rel.date}
                  </span>
                </div>

                <h3 className='font-semibold text-base sm:text-lg text-[var(--color-ink)]'>
                  {rel.title}
                </h3>

                <ul className='space-y-2.5 text-xs sm:text-sm text-[var(--color-ink-muted)]'>
                  {rel.highlights.map((item, idx) => (
                    <li key={idx} className='flex items-start gap-2.5'>
                      <span className='text-[var(--color-accent)] mt-1 font-mono text-xs'>✓</span>
                      <span className='leading-relaxed'>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
