import type { Metadata } from 'next';
import { SiteNav } from '@/features/landing/components/site-nav';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { GITHUB_URL } from '@/features/landing/components/github-star';
import { Icons } from '@/components/icons';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contact & Support — WA OTP Gateway',
  description:
    'Get in touch with the creator of WA OTP Gateway, Lucky Yaduvanshi, or explore CodaiPro developer tools and open-source discussions.',
  openGraph: {
    title: 'Contact & Support — WA OTP Gateway',
    description: 'Get in touch with Lucky Yaduvanshi or explore CodaiPro developer tools.',
    url: `${SITE_URL}/contact`,
    siteName: 'WA OTP',
    type: 'website'
  }
};

export default function ContactPage() {
  return (
    <div className='lm lm-shell'>
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-hero'>
        <div className='lm-hero__body'>
          <p className='lm-eyebrow'>connect & collaborate</p>
          <h1 className='lm-display'>
            <em>contact</em> & support.
          </h1>
          <p className='lm-lede'>
            Have questions about integrating WA OTP, sponsorship inquiries, or suggestions for
            CodaiPro developer tools? We&apos;re here to help.
          </p>
        </div>
      </header>

      <main>
        <section className='lm-section' id='channels' aria-labelledby='channels-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>channels</p>
            <h2 className='lm-h2' id='channels-h'>
              ways to reach us.
            </h2>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-6 pt-4'>
            {/* Developer Card */}
            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-6 space-y-3 flex flex-col justify-between'>
              <div className='space-y-2'>
                <span className='inline-block rounded bg-primary/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-primary'>
                  Lead Maintainer
                </span>
                <h3 className='font-semibold text-base text-[var(--color-ink)]'>
                  Lucky Yaduvanshi
                </h3>
                <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                  Software engineer, systems architect, and creator of WA OTP and the CodaiPro
                  developer tools suite.
                </p>
              </div>
              <a
                href='https://luckyyaduvanshi.in/'
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] hover:underline pt-2'
              >
                <span>Visit luckyyaduvanshi.in</span>
                <Icons.externalLink className='size-3' />
              </a>
            </div>

            {/* CodaiPro Card */}
            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-6 space-y-3 flex flex-col justify-between'>
              <div className='space-y-2'>
                <span className='inline-block rounded bg-sky-500/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-sky-600 dark:text-sky-400'>
                  Company & Ecosystem
                </span>
                <h3 className='font-semibold text-base text-[var(--color-ink)]'>
                  CodaiPro Developer Tools
                </h3>
                <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                  Free, lightning-fast utilities built for software engineers, including Temp Mail
                  disposable inboxes.
                </p>
              </div>
              <a
                href='https://codaipro.com/'
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline pt-2'
              >
                <span>Explore codaipro.com</span>
                <Icons.externalLink className='size-3' />
              </a>
            </div>

            {/* GitHub Community Card */}
            <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-6 space-y-3 flex flex-col justify-between'>
              <div className='space-y-2'>
                <span className='inline-block rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-amber-600 dark:text-amber-400'>
                  Open Source
                </span>
                <h3 className='font-semibold text-base text-[var(--color-ink)]'>
                  GitHub Community
                </h3>
                <p className='text-xs text-[var(--color-ink-muted)] leading-relaxed'>
                  Open a discussion, report bugs, or submit pull requests directly to the
                  open-source repository.
                </p>
              </div>
              <a
                href={GITHUB_URL}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline pt-2'
              >
                <span>View GitHub Repository</span>
                <Icons.externalLink className='size-3' />
              </a>
            </div>
          </div>
        </section>

        {/* Community Sponsorship Notice */}
        <section className='lm-section' id='sponsorship' aria-labelledby='sponsorship-h'>
          <div className='rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-6 sm:p-8 space-y-4'>
            <div className='flex items-center gap-2'>
              <Icons.sparkles className='size-5 text-[var(--color-accent)]' />
              <h2 className='font-semibold text-base sm:text-lg text-[var(--color-ink)]'>
                Sponsor a Verified Meta Line
              </h2>
            </div>
            <p className='text-xs sm:text-sm text-[var(--color-ink-muted)] leading-relaxed max-w-2xl'>
              We are actively looking for companies or sponsors willing to sponsor a verified Meta
              Business line for the community, allowing open-source developers to test production
              WhatsApp templates freely.
            </p>
            <div>
              <a
                href='https://luckyyaduvanshi.in/'
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] hover:underline'
              >
                <span>Inquire about sponsorship</span>
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
