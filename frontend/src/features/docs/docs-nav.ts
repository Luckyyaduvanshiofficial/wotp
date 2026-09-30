/**
 * The docs section, defined once.
 *
 * The sidebar, the hub page's index, the sitemap and the breadcrumb trail all
 * read this list. Adding a page in one place is the whole job — a docs section
 * where the nav and the sitemap disagree is a docs section with orphan pages,
 * and orphan pages do not rank.
 *
 * `intent` is the query the page is written to answer. It is not decoration:
 * when a page stops matching its intent, the page and the wording both change.
 */
export interface DocsPage {
  href: string;
  /** Sidebar + hub label. Sentence case, short. */
  label: string;
  /** One line for the hub index and meta descriptions. */
  blurb: string;
  /** The search intent this page exists to serve. */
  intent: string;
}

export const DOCS_PAGES: DocsPage[] = [
  {
    href: '/docs/quickstart',
    label: 'Quickstart',
    blurb: 'Two HTTP calls, from a fresh install to a verified code. Copy-paste, no framework.',
    intent: 'send an OTP from my backend'
  },
  {
    href: '/docs/whatsapp',
    label: 'WhatsApp OTP',
    blurb:
      'The Meta Cloud API path: business verification, the authentication template, and the four things that stop a launch.',
    intent: 'whatsapp cloud api authentication template for OTP'
  },
  {
    href: '/docs/telegram',
    label: 'Telegram OTP',
    blurb:
      'The channel with no business verification, no card and no per-message fee. Bot setup and the linking flow.',
    intent: 'send OTP through a telegram bot'
  },
  {
    href: '/docs/self-hosting',
    label: 'Self-hosting',
    blurb:
      'Docker Compose, TLS, backups and upgrades. What production refuses to boot without, and why.',
    intent: 'self host an OTP gateway / docker compose'
  },
  {
    href: '/docs/api',
    label: 'API reference',
    blurb: 'Every endpoint, every field, every error code and the retry decision for each.',
    intent: 'OTP API reference and error codes'
  },
  {
    href: '/docs/faq',
    label: 'FAQ',
    blurb: 'The questions that decide whether this fits your project, answered without hedging.',
    intent: 'is there a free / open source OTP service'
  }
];

/** Sidebar order includes the hub itself, which is not in DOCS_PAGES. */
export const DOCS_HUB = { href: '/docs', label: 'Overview' };
