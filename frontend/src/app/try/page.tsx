import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { SiteNav } from '@/features/landing/components/site-nav';
import { TryPlayground } from '@/features/try/try-playground';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Try the OTP API in your browser: no install, no signup',
  description:
    'Run the real send and verify calls against a browser-local model of the WOTP gateway. See every response body, status code and Retry-After before you self-host. No account, nothing sent.',
  keywords: [
    'OTP API demo',
    'try WhatsApp OTP API',
    'Telegram OTP API playground',
    'OTP gateway sandbox',
    'test OTP API without signup',
    'self hosted OTP demo'
  ],
  alternates: { canonical: '/try' },
  openGraph: {
    title: 'Try the OTP API in your browser: no install, no signup',
    description:
      'Run the real send and verify calls against a browser-local model of the gateway. See every response body and status code before you self-host.',
    url: `${SITE_URL}/try`,
    siteName: 'WOTP',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Try the OTP API in your browser',
    description:
      'No install, no signup, nothing sent. See the real wire format for send, verify and every failure path.'
  }
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Try it', item: `${SITE_URL}/try` }
      ]
    },
    {
      '@type': 'WebAPI',
      name: 'WOTP gateway API',
      description:
        'Two-call OTP gateway API. One endpoint sends a code over WhatsApp or Telegram, one verifies it.',
      documentation: `${SITE_URL}/docs/api`,
      provider: { '@type': 'Organization', name: 'WOTP' }
    }
  ]
};

export default function TryPage() {
  return (
    <div className='lm lm-shell'>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-docs__hero'>
        <div className='lm-head'>
          <p className='lm-eyebrow'>try · no install · nothing sent</p>
          <h1 className='lm-display'>
            <em>run</em> it here before you run it anywhere.
          </h1>
          <p className='lm-lede'>
            Self-hosting a gateway you have never called is a bad first date. So the whole contract
            runs in this page: two calls, every status code, every failure path an integration has
            to handle. No gateway, no account, no signup, and no message leaves your browser.
          </p>
        </div>
        <div className='lm-actions'>
          <Link href='/docs/quickstart' className='lm-actions__primary'>
            then wire it up
          </Link>
          <Link href='/docs/api' className='lm-actions__ghost'>
            read the reference
          </Link>
        </div>
      </header>

      <main>
        <TryPlayground />

        <section className='lm-section lm-section--close' aria-labelledby='try-next'>
          <h2 className='lm-h2' id='try-next'>
            seen enough? it runs on your own box in about ten minutes.
          </h2>
          <p className='lm-lede'>
            Docker Compose, one command, your own Meta and Telegram credentials. There is no hosted
            tier to upgrade to and nothing to pay this project. WhatsApp messages are billed by Meta
            to you, directly.
          </p>
          <div className='lm-actions'>
            <Link href='/docs/self-hosting' className='lm-actions__primary'>
              self-host it
            </Link>
            <Link href='/docs/quickstart' className='lm-actions__ghost'>
              quickstart
            </Link>
            <Link href='/docs/faq' className='lm-actions__ghost'>
              questions
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
