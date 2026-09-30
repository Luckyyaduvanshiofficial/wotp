import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsShell } from '@/features/docs/docs-shell';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'FAQ: free OTP service, licensing, costs and limits',
  description:
    'Straight answers about the self-hosted OTP gateway: is it really free, do you need a WhatsApp Business account, what Meta charges, what the licence is, and what this software deliberately does not do.',
  keywords: [
    'free OTP service',
    'open source OTP',
    'WhatsApp OTP cost',
    'OTP service without business verification',
    'self hosted OTP license',
    'AGPL OTP gateway'
  ],
  alternates: { canonical: '/docs/faq' },
  openGraph: {
    title: 'FAQ: free OTP service, licensing, costs and limits',
    description:
      'Is it really free, what Meta charges, what the licence is, and what this software deliberately does not do.',
    url: `${SITE_URL}/docs/faq`,
    siteName: 'WOTP',
    type: 'article'
  }
};

/**
 * The questions and answers, defined once.
 *
 * The page renders this array and the FAQPage structured data is generated from
 * the same array. Schema that disagrees with the visible text is a rich-result
 * violation, and maintaining two copies is how that happens.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is this a free OTP service?',
    a: 'The software is free and there is no paid tier. Whether sending costs you anything depends on the channel. Telegram bot messages are free, so a Telegram-only install costs nothing but the server. WhatsApp messages are billed by Meta to your own Meta account, at Meta’s rates, and this project never sits between you and that bill.'
  },
  {
    q: 'Do I need a WhatsApp Business account?',
    a: 'Only if you want the WhatsApp channel. Meta requires business verification, a phone number that is not already on WhatsApp, an approved authentication template and a payment method before production WhatsApp traffic flows. Telegram requires one bot token and none of that.'
  },
  {
    q: 'Can I send OTPs without business verification?',
    a: 'On Telegram, yes, immediately. On WhatsApp, no: the requirements are Meta’s, not this project’s, and no amount of application code changes them. That is the main reason the Telegram channel exists here.'
  },
  {
    q: 'What does this cost me?',
    a: 'Nothing to this project, ever. You pay for the machine you host it on. If you use WhatsApp, Meta bills you directly for each message. There is no hosted tier, no per-seat licence and no usage fee.'
  },
  {
    q: 'What licence is it under?',
    a: 'The GNU Affero General Public License v3.0. In practice: you can run it, modify it and self-host it freely, including commercially. If you run a modified version as a network service, the AGPL requires you to offer your users the modified source. That is deliberate, and it is what stops someone taking this and running a closed competing service on it.'
  },
  {
    q: 'Do you host it for me, or offer a cloud version?',
    a: 'No. There is no hosted tier and no account to create with the project. Operating a gateway for other people would mean holding their credentials and paying for their messages, which is exactly the arrangement this design avoids.'
  },
  {
    q: 'Does my data go anywhere?',
    a: 'Nowhere except the services you configure. There is no telemetry, no licence check, no analytics and no call to any endpoint belonging to the authors. The dashboard reads its configuration at build time and talks only to your own PocketBase and API. Opt-in error reporting is off unless you set a DSN yourself.'
  },
  {
    q: 'Is it production ready?',
    a: 'It is complete and tested, and the honest caveat is scale rather than correctness. The gateway runs a single API worker by design, because its send and verify locks, idempotency store and rate limiters are process-global. That comfortably covers a small or mid-sized product; it is not built to be a multi-region messaging platform.'
  },
  {
    q: 'What happens if my users do not have WhatsApp?',
    a: 'The same API covers Telegram, so you can offer both and let the user pick. WhatsApp sends are metered against the installation’s monthly cap while Telegram is never metered, so Telegram is also the documented way around a spent cap.'
  },
  {
    q: 'Are one-time codes stored in plaintext?',
    a: 'No. Codes and API keys are stored only as SHA-256 digests, and provider tokens are encrypted at rest with Fernet. Phone numbers are the one thing stored as-is, because delivery and verification have to be matched against them. Phone numbers are also masked in every log line.'
  },
  {
    q: 'Can I call the API from a browser or mobile app?',
    a: 'No, and the gateway enforces it. An API key shipped in a front end is public the moment the page loads. Call the API from your backend: your client talks to your server, and your server talks to the gateway with the key in an environment variable.'
  },
  {
    q: 'How many messages can it send?',
    a: 'The installation applies a monthly WhatsApp cap, 500 by default, which the operator can change or set to zero for no cap. Telegram is never metered against it. There is also a per-phone limit of five sends an hour across both channels, which exists so a stolen screen cannot be used to hammer someone’s number, and a per-key rate limit of ten requests a minute.'
  },
  {
    q: 'Why PocketBase instead of Postgres?',
    a: 'Because the whole point of this project is that one person can run it. PocketBase is a single binary with a SQLite file, so a backup is a file copy and there is no second service to operate or upgrade. It also gives the operator a real admin UI for audit rows and settings without this project building one.'
  },
  {
    q: 'What does it not do?',
    a: 'It does not resell messaging, does not bundle a verified WhatsApp number for the community, and does not host anything for you. It also provides no magic around Meta’s own constraints: tiering, template approval, quality ratings and the 24-hour customer service window all still apply.'
  }
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      // Schema must carry plain text, so the one entity-escaped answer is
      // decoded rather than shipped with its ampersand entity intact.
      text: item.a.replace(/’/g, "'")
    }
  }))
};

export default function FaqPage() {
  return (
    <DocsShell
      current='/docs/faq'
      eyebrow='docs · faq'
      title={
        <>
          the questions that decide if this <em>fits</em>.
        </>
      }
      lede='Short answers, no hedging. If a question here has an answer you do not like, that is useful information, and it is better found now than after you have pointed DNS at a server.'
      actions={
        <>
          <Link href='/try' className='lm-actions__primary'>
            try it in the browser
          </Link>
          <Link href='/docs/self-hosting' className='lm-actions__ghost'>
            self-host it
          </Link>
        </>
      }
    >
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h2 id='questions'>Questions</h2>
      <dl className='lm-faq'>
        {FAQ.map((item) => (
          <div className='lm-faq__item' key={item.q}>
            <dt>{item.q}</dt>
            <dd>{item.a}</dd>
          </div>
        ))}
      </dl>

      <h2 id='still-asking'>Still deciding?</h2>
      <p>
        The two things people usually want next are the <Link href='/try'>browser playground</Link>,
        which shows the exact wire format without an install, and the{' '}
        <Link href='/docs/quickstart'>quickstart</Link>, which is the integration in full. If your
        question is about a specific Meta requirement,{' '}
        <Link href='/docs/whatsapp'>the WhatsApp page</Link> covers it in more depth than the FAQ
        can.
      </p>
    </DocsShell>
  );
}
