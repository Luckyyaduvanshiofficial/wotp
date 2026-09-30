import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsShell } from '@/features/docs/docs-shell';
import { DOCS_PAGES } from '@/features/docs/docs-nav';
import { CopyButton } from '@/features/landing/components/copy-button';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Documentation: self-hosted WhatsApp & Telegram OTP gateway',
  description:
    'Install, configure and integrate a self-hosted OTP gateway on your own Meta and Telegram credentials. Quickstart, WhatsApp template setup, Docker deployment and the full API reference.',
  keywords: [
    'OTP gateway documentation',
    'self hosted OTP setup',
    'WhatsApp OTP API docs',
    'Telegram OTP API docs',
    'open source OTP service'
  ],
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'Documentation: self-hosted WhatsApp & Telegram OTP gateway',
    description:
      'Quickstart, WhatsApp template setup, Docker deployment and the full API reference.',
    url: `${SITE_URL}/docs`,
    siteName: 'WA OTP',
    type: 'website'
  }
};

export const dynamic = 'force-static';

const BRIEFING_PATH = '/agent-briefing.md';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'Self-hosted WhatsApp and Telegram OTP gateway documentation',
  description:
    'Install, configure and integrate a self-hosted OTP gateway using your own Meta WhatsApp Cloud API and Telegram bot credentials.',
  url: `${SITE_URL}/docs`,
  about: ['One-time password', 'WhatsApp Cloud API', 'Telegram Bot API', 'FastAPI'],
  isPartOf: { '@type': 'WebSite', name: 'WA OTP', url: SITE_URL }
};

export default function DocsHubPage() {
  // One file, two jobs: `public/` makes it fetchable at /agent-briefing.md, and
  // reading it here lets the page show the exact payload the button copies. If
  // they were two files they would eventually disagree.
  const briefing = fs.readFileSync(path.join(process.cwd(), 'public', 'agent-briefing.md'), 'utf8');

  return (
    <DocsShell
      current='/docs'
      eyebrow='docs · v0.1.0'
      title={
        <>
          <em>read</em> it before you run it.
        </>
      }
      lede='This is a two-call OTP gateway you host yourself, on your own Meta and Telegram credentials. The docs are short because the surface is short. Start with the quickstart, or hand the briefing below to your agent.'
      actions={
        <>
          <Link href='/docs/quickstart' className='lm-actions__primary'>
            quickstart
          </Link>
          <Link href='/try' className='lm-actions__ghost'>
            try it in the browser
          </Link>
          <Link href='/docs/api' className='lm-actions__ghost'>
            api reference
          </Link>
        </>
      }
    >
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h2 id='index'>What is in here</h2>
      <p>
        Six pages. Each one answers a question you actually have to settle before this is running
        and sending codes to real phones.
      </p>
      <ul>
        {DOCS_PAGES.map((page) => (
          <li key={page.href}>
            <Link href={page.href}>{page.label}</Link>: {page.blurb}
          </li>
        ))}
      </ul>

      <h2 id='what-it-is'>What this software is, and what it is not</h2>
      <p>
        Being precise here saves everyone a support thread. This project is a{' '}
        <strong>gateway</strong>: it sits between your application and a messaging provider you
        already have an account with. It is not a messaging provider, and it does not resell
        anything.
      </p>
      <ul>
        <li>
          <strong>You bring your own credentials.</strong> Your Meta WhatsApp Business account, your
          Telegram bot. Nothing is shared with the project&rsquo;s authors, and no code here calls a
          service they operate.
        </li>
        <li>
          <strong>You pay the provider, not this project.</strong> WhatsApp messages are billed by
          Meta to you, at Meta&rsquo;s rates. Telegram delivery is free. This software costs nothing
          either way.
        </li>
        <li>
          <strong>There is no hosted tier.</strong> No signup, no account, no usage dashboard
          belonging to anyone but you. You run the container and you hold the database.
        </li>
        <li>
          <strong>It is one process.</strong> One FastAPI worker, one PocketBase, one Postgres-free
          SQLite file. The docs say so explicitly because the in-memory locks and rate limiters
          assume it.
        </li>
      </ul>

      <h2 id='briefing'>Hand this to your agent</h2>
      <p>
        The whole contract is one self-contained file, written to be pasted into a context window.
        It is generated from the same facts as the <Link href='/docs/api'>API reference</Link>, so
        the two cannot drift. Copy it, or point your agent at <code>{BRIEFING_PATH}</code> directly.
      </p>
      <div className='lm-actions'>
        <CopyButton value={briefing} label='copy for agent' className='lm-copy lm-copy--primary' />
        <a href={BRIEFING_PATH} className='lm-actions__ghost'>
          raw markdown
        </a>
      </div>
      <pre className='lm-code lm-code--tall'>{briefing}</pre>

      <h2 id='next'>Where to go next</h2>
      <p>
        If you want to see the wire format before installing anything,{' '}
        <Link href='/try'>run the calls in your browser</Link>. It behaves like the gateway because
        it runs the same documented rules, and it sends nothing anywhere. When you are ready for a
        real one, <Link href='/docs/self-hosting'>self-hosting</Link> is about ten minutes.
      </p>
    </DocsShell>
  );
}
