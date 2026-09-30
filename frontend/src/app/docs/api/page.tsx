import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsView } from '@/components/docs/docs-view';
import { DocsShell } from '@/features/docs/docs-shell';
import { CopyButton } from '@/features/landing/components/copy-button';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'API reference: send, verify, usage and every error code',
  description:
    'The complete OTP gateway API: POST /v1/otp/send, POST /v1/otp/verify, usage, key management, health. Every request field, every response body, every error code and the retry decision for each.',
  keywords: [
    'OTP API reference',
    'OTP API error codes',
    'send verify OTP endpoint',
    'Retry-After 429 OTP',
    'OTP webhook API'
  ],
  alternates: { canonical: '/docs/api' },
  openGraph: {
    title: 'API reference: send, verify, usage and every error code',
    description:
      'Every endpoint, field, error code and the retry decision for each. Plus a self-contained briefing you can paste into an agent.',
    url: `${SITE_URL}/docs/api`,
    siteName: 'WOTP',
    type: 'article'
  }
};

export const dynamic = 'force-static';

const BRIEFING_PATH = '/agent-briefing.md';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'WOTP gateway API reference',
  url: `${SITE_URL}/docs/api`,
  about: ['REST API', 'one-time password', 'WhatsApp Cloud API', 'Telegram Bot API'],
  isPartOf: { '@type': 'WebSite', name: 'WOTP', url: SITE_URL }
};

export default function ApiReferencePage() {
  // Rendered from the same file the repository's own tests are written against,
  // so this page cannot describe an API the gateway does not serve.
  const markdown = fs.readFileSync(path.join(process.cwd(), 'content', 'docs.md'), 'utf8');
  const briefing = fs.readFileSync(path.join(process.cwd(), 'public', 'agent-briefing.md'), 'utf8');

  return (
    <DocsShell
      current='/docs/api'
      eyebrow='docs · api reference · v0.1.0'
      title={
        <>
          every field, every <em>failure</em>, and what to do about it.
        </>
      }
      lede='Two endpoints do the work; the rest of this page is the detail around them. It is written for the person wiring the integration and the agent helping them, which is why the retry decision for every error code is spelled out rather than implied.'
      actions={
        <>
          <CopyButton
            value={briefing}
            label='copy the agent briefing'
            className='lm-copy lm-copy--primary'
          />
          <a href={BRIEFING_PATH} className='lm-actions__ghost'>
            raw markdown
          </a>
          <Link href='/try' className='lm-actions__ghost'>
            run the calls
          </Link>
        </>
      }
    >
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h2 id='reference'>The full reference</h2>
      <DocsView markdown={markdown} />
    </DocsShell>
  );
}
