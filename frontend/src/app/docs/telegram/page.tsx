import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsShell } from '@/features/docs/docs-shell';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Telegram OTP: send one-time passwords through a bot, free',
  description:
    'No business verification, no card, no per-message fee. Create a bot, register the webhook, and handle the one bounced send that links a new phone. Includes the request_contact flow that stops number-spoofing.',
  keywords: [
    'Telegram OTP bot',
    'send OTP Telegram',
    'free OTP service',
    'Telegram bot phone verification',
    'request_contact OTP',
    'Telegram OTP API'
  ],
  alternates: { canonical: '/docs/telegram' },
  openGraph: {
    title: 'Telegram OTP: send one-time passwords through a bot, free',
    description:
      'Create a bot, register the webhook, and handle the one bounced send that links a new phone.',
    url: `${SITE_URL}/docs/telegram`,
    siteName: 'WA OTP',
    type: 'article'
  }
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'Sending one-time passwords through a Telegram bot',
  url: `${SITE_URL}/docs/telegram`,
  about: ['Telegram Bot API', 'one-time password', 'phone verification'],
  isPartOf: { '@type': 'WebSite', name: 'WA OTP', url: SITE_URL }
};

export default function TelegramDocsPage() {
  return (
    <DocsShell
      current='/docs/telegram'
      eyebrow='docs · telegram'
      title={
        <>
          the channel with <em>no</em> gatekeeping.
        </>
      }
      lede='A Telegram bot needs one token, no business verification, no credit card and no approval process. Delivery is free. The only thing it cannot do is message someone who has never spoken to the bot, and that turns out to be a feature.'
      actions={
        <>
          <Link href='/try' className='lm-actions__primary'>
            watch the linking flow
          </Link>
          <Link href='/docs/whatsapp' className='lm-actions__ghost'>
            compare with whatsapp
          </Link>
        </>
      }
    >
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h2 id='why'>Why this channel exists in this project</h2>
      <p>
        WhatsApp is the channel most users expect, and it is gated behind business verification, a
        dedicated SIM, a card that supports recurring international debit, and template review. That
        is fine for a company. It is a wall for an internal tool, a side project, a college project,
        or a launch that has not incorporated yet.
      </p>
      <p>
        Telegram has none of that. You ask a bot for a token and you are sending messages the same
        minute, for free. The gateway treats both channels as first-class: same endpoints, same
        error shape, one <code>channel</code> field apart. Quota is metered against WhatsApp only,
        so Telegram traffic is never blocked by a spent monthly cap.
      </p>

      <h2 id='setup'>Operator setup, once</h2>
      <ol>
        <li>
          <p>
            <strong>Create the bot.</strong> Talk to{' '}
            <a href='https://t.me/BotFather' rel='noreferrer'>
              @BotFather
            </a>
            , send <code>/newbot</code>, choose a name and a username, and copy the token it gives
            you.
          </p>
        </li>
        <li>
          <p>
            <strong>Put the credentials in the environment.</strong> The username is what the
            gateway builds deep links from, so it must not include the leading <code>@</code>.
          </p>
          <pre className='lm-code'>{`TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_BOT_USERNAME=your_bot_username
TELEGRAM_WEBHOOK_SECRET=a-long-random-string`}</pre>
        </li>
        <li>
          <p>
            <strong>Register the webhook.</strong> Telegram has to be told where to deliver updates.
            The gateway ships a script for it.
          </p>
          <pre className='lm-code'>{`cd backend
.venv/bin/python scripts/set_telegram_webhook.py https://api.example.com`}</pre>
          <p>
            That resolves to <code>{'{APP_URL}/telegram/webhook'}</code> and attaches the secret, so
            the endpoint is not openly callable. If the secret and the registered value ever
            disagree, Telegram&rsquo;s updates start failing and the bot goes silent.
          </p>
        </li>
      </ol>

      <h2 id='linking'>The one bounce, and why it is a feature</h2>
      <p>
        Telegram bots can only message people who have started a chat with them. That is an
        anti-spam rule, and it cannot be bypassed. So the very first code to a phone bounces once,
        on purpose:
      </p>
      <pre className='lm-code'>{`{
  "ok": false,
  "error": "user_not_linked",
  "link_url": "https://t.me/<bot_username>?start=<signed-token>"
}`}</pre>
      <p>
        <strong>What your application does:</strong> show a &ldquo;connect telegram&rdquo; button
        that opens <code>link_url</code>, then retry the same send. That is the entire integration.
        There is no &ldquo;check link status&rdquo; endpoint, because the 409 <em>is</em> the check,
        and the bounce consumed nothing: no code stored, no quota, no throttle.
      </p>
      <p>What happens after the user taps the button:</p>
      <ol>
        <li>
          The bot opens in Telegram with <code>/start</code> and a signed token pre-filled.
        </li>
        <li>
          The bot replies with a one-time keyboard containing a single{' '}
          <strong>&ldquo;share my number&rdquo;</strong> button.
        </li>
        <li>
          The user taps it. The bot accepts the contact{' '}
          <strong>only if it belongs to the sender themselves</strong>. Nobody can link a
          friend&rsquo;s number, or a stranger&rsquo;s.
        </li>
        <li>The number is now linked, and your retry delivers the code on Telegram.</li>
      </ol>
      <p>
        Linking is one-time per phone and platform-wide: once a user has connected to the bot, every
        application on the gateway can reach them. That is why the shared &ldquo;connect&rdquo;
        button is safe to show on the first bounce of any flow.
      </p>

      <h2 id='trying'>Watching it without setting anything up</h2>
      <p>
        The <Link href='/try'>browser playground</Link> runs this exact flow: send on Telegram to an
        unlinked number, watch the 409 come back with a deep link, simulate the tap, then send again
        and see the code arrive. Nothing is sent and no bot is needed.
      </p>

      <h2 id='cost'>What it costs</h2>
      <p>
        Nothing, in both senses. Telegram charges for bot messages, so there is no per-message cost
        to pass on, and this project takes no cut and resells nothing. The only running cost is the
        machine you host the gateway on.
      </p>
      <p>
        That is also the honest limit of this channel: Telegram reaches people who have Telegram.
        For consumer onboarding in a market where WhatsApp is the default messenger, you will
        eventually need <Link href='/docs/whatsapp'>the WhatsApp path</Link> as well. Running both
        is supported and costs one field.
      </p>

      <h2 id='next'>Next</h2>
      <ul>
        <li>
          <Link href='/docs/quickstart'>Quickstart</Link>: the send and verify calls, including the
          409 branch.
        </li>
        <li>
          <Link href='/docs/self-hosting'>Self-hosting</Link>: bot token and webhook in context.
        </li>
        <li>
          <Link href='/docs/api'>API reference</Link>: the full error table.
        </li>
      </ul>
    </DocsShell>
  );
}
