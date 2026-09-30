import type { Metadata } from 'next';
import { SiteNav } from '@/features/landing/components/site-nav';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Disclaimer — WOTP Gateway',
  description:
    'Trademark disclaimer and independent project disclosure for WOTP Gateway. Not affiliated with Meta Platforms, Inc., WhatsApp LLC, or Telegram FZ-LLC.',
  openGraph: {
    title: 'Disclaimer — WOTP Gateway',
    description: 'Trademark disclaimer and independent project disclosure.',
    url: `${SITE_URL}/disclaimer`,
    siteName: 'WOTP',
    type: 'website'
  }
};

export default function DisclaimerPage() {
  return (
    <div className='lm lm-shell'>
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-hero'>
        <div className='lm-hero__body'>
          <p className='lm-eyebrow'>legal notices</p>
          <h1 className='lm-display'>
            <em>disclaimer</em> & trademark notice.
          </h1>
          <p className='lm-lede'>
            Independent open-source project disclosure, trademark attributions, and compliance
            responsibilities.
          </p>
        </div>
      </header>

      <main>
        <section className='lm-section' id='disclaimer' aria-labelledby='disclaimer-h'>
          <div className='max-w-3xl space-y-8 text-xs sm:text-sm text-[var(--color-ink-muted)] leading-relaxed'>
            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                1. Independent Project Disclosure
              </h2>
              <p>
                WOTP is an independent open-source software project developed by Lucky Yaduvanshi
                and hosted under CodaiPro. WOTP is <strong>NOT</strong> affiliated with, associated
                with, authorized by, endorsed by, or in any way officially connected with:
              </p>
              <ul className='list-disc pl-5 space-y-1.5'>
                <li>
                  <strong>Meta Platforms, Inc.</strong> or any of its subsidiaries, including{' '}
                  <strong>WhatsApp LLC</strong>.
                </li>
                <li>
                  <strong>Telegram FZ-LLC</strong> or any of its subsidiaries or affiliates.
                </li>
              </ul>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                2. Trademark Attributions
              </h2>
              <p>
                All product and company names, logos, and brands mentioned on this website and in
                the documentation are trademarks™ or registered® trademarks of their respective
                owners:
              </p>
              <ul className='list-disc pl-5 space-y-1.5'>
                <li>&quot;WhatsApp&quot; is a registered trademark of Meta Platforms, Inc.</li>
                <li>&quot;Telegram&quot; is a registered trademark of Telegram FZ-LLC.</li>
                <li>
                  Use of these trademarks on this website or in code repositories is strictly for
                  identification and interoperability purposes only, and does not imply any
                  affiliation or endorsement.
                </li>
              </ul>
            </div>

            <div className='space-y-3'>
              <h2 className='text-base sm:text-lg font-bold text-[var(--color-ink)]'>
                3. Compliance Responsibility
              </h2>
              <p>
                Developers and self-hosters utilizing this software to send messages are solely
                responsible for ensuring compliance with all applicable laws, terms of service, and
                acceptable use policies, including the Meta WhatsApp Business Policy, WhatsApp
                Commerce Policy, and Telegram Bot terms.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
