import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/features/landing/components/site-nav';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { GITHUB_URL } from '@/features/landing/components/github-star';
import { Icons } from '@/components/icons';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Report a Bug — WA OTP Gateway Issue Tracker',
  description:
    'Found an issue, bug, or unexpected behavior in WA OTP Gateway? Submit a bug report on GitHub or contact the maintainers directly.',
  openGraph: {
    title: 'Report a Bug — WA OTP Gateway Issue Tracker',
    description: 'Found an issue with WA OTP Gateway? Submit a bug report on GitHub.',
    url: `${SITE_URL}/report-bug`,
    siteName: 'WA OTP',
    type: 'website'
  }
};

export default function ReportBugPage() {
  const issueUrl = `${GITHUB_URL}/issues/new`;

  return (
    <div className='lm lm-shell'>
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-hero'>
        <div className='lm-hero__body'>
          <p className='lm-eyebrow'>quality & stability</p>
          <h1 className='lm-display'>
            <em>report</em> an issue or bug.
          </h1>
          <p className='lm-lede'>
            We strive for zero defects and total engineering transparency. If you encounter an
            error, unexpected behavior, or a documentation gap, please submit an issue on GitHub.
          </p>
          <div className='lm-actions'>
            <a
              href={issueUrl}
              target='_blank'
              rel='noreferrer'
              className='lm-actions__primary inline-flex items-center gap-2'
            >
              <span>open github issue</span>
              <Icons.externalLink className='size-3.5' />
            </a>
            <Link href='/docs' className='lm-actions__ghost'>
              troubleshooting docs
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Pre-submission checklist */}
        <section className='lm-section' id='checklist' aria-labelledby='checklist-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>01 · diagnostic checklist</p>
            <h2 className='lm-h2' id='checklist-h'>
              quick troubleshooting before filing.
            </h2>
            <p className='lm-lede'>
              Many delivery or auth errors arise from minor environment misconfigurations. Check
              these common points first:
            </p>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 pt-2'>
            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-5 space-y-2'>
              <h3 className='font-semibold text-sm text-[var(--color-ink)] flex items-center gap-2'>
                <Icons.warning className='size-4 text-amber-500' />
                1. Check Mock Delivery Setting
              </h3>
              <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                If messages are written to the database but no real WhatsApp/Telegram message
                arrives, verify if <code>WAOTP_MOCK_DELIVERY=1</code> is set. Set it to{' '}
                <code>0</code> for live dispatch.
              </p>
            </div>

            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-5 space-y-2'>
              <h3 className='font-semibold text-sm text-[var(--color-ink)] flex items-center gap-2'>
                <Icons.key className='size-4 text-sky-500' />
                2. Verify API Key Header
              </h3>
              <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                Calls to <code>/v1/otp/send</code> and <code>/v1/otp/verify</code> require the
                secret key in the <code>X-Api-Key</code> header, NOT the bearer Authorization token.
              </p>
            </div>

            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-5 space-y-2'>
              <h3 className='font-semibold text-sm text-[var(--color-ink)] flex items-center gap-2'>
                <Icons.refresh className='size-4 text-emerald-500' />
                3. Rate Limits & Mutual Exclusions
              </h3>
              <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                When you resend an OTP to the same phone number, prior active codes are
                automatically invalidated. Sending more than 5 OTPs per hour to one phone number
                triggers HTTP 429.
              </p>
            </div>

            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-5 space-y-2'>
              <h3 className='font-semibold text-sm text-[var(--color-ink)] flex items-center gap-2'>
                <Icons.flask className='size-4 text-purple-500' />
                4. Test in Interactive Sandbox
              </h3>
              <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                Use the{' '}
                <Link href='/dashboard/tester' className='text-[var(--color-accent)] underline'>
                  Dashboard OTP Tester
                </Link>{' '}
                to isolate whether the issue is with your client code or the server environment.
              </p>
            </div>
          </div>
        </section>

        {/* Issue Templates */}
        <section className='lm-section' id='categories' aria-labelledby='categories-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>02 · issue types</p>
            <h2 className='lm-h2' id='categories-h'>
              choose the report template that fits.
            </h2>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-6 pt-2'>
            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-6 space-y-3 flex flex-col justify-between'>
              <div className='space-y-2'>
                <span className='inline-block rounded bg-red-500/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-red-600 dark:text-red-400'>
                  Bug Report
                </span>
                <h3 className='font-semibold text-base text-[var(--color-ink)]'>
                  API or UI Glitch
                </h3>
                <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                  Report unexpected HTTP responses, schema errors, or rendering problems in the
                  dashboard.
                </p>
              </div>
              <a
                href={`${GITHUB_URL}/issues/new?title=%5BBug%5D%3A+`}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] hover:underline pt-2'
              >
                <span>File bug report</span>
                <Icons.arrowRight className='size-3' />
              </a>
            </div>

            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-6 space-y-3 flex flex-col justify-between'>
              <div className='space-y-2'>
                <span className='inline-block rounded bg-sky-500/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-sky-600 dark:text-sky-400'>
                  Feature Request
                </span>
                <h3 className='font-semibold text-base text-[var(--color-ink)]'>
                  New Channel or Tool
                </h3>
                <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                  Propose new notification channels (e.g. Discord, RCS, Twilio fallback) or
                  dashboard enhancements.
                </p>
              </div>
              <a
                href={`${GITHUB_URL}/issues/new?title=%5BFeature%5D%3A+`}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] hover:underline pt-2'
              >
                <span>Request feature</span>
                <Icons.arrowRight className='size-3' />
              </a>
            </div>

            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-6 space-y-3 flex flex-col justify-between'>
              <div className='space-y-2'>
                <span className='inline-block rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-amber-600 dark:text-amber-400'>
                  Security Disclosure
                </span>
                <h3 className='font-semibold text-base text-[var(--color-ink)]'>
                  Vulnerability Report
                </h3>
                <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                  Found a security or cryptography flaw? Please report it responsibly directly to
                  the lead maintainer.
                </p>
              </div>
              <a
                href='https://luckyyaduvanshi.in/'
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline pt-2'
              >
                <span>Contact Lucky Yaduvanshi</span>
                <Icons.arrowRight className='size-3' />
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
