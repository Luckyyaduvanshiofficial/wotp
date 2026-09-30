import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsShell } from '@/features/docs/docs-shell';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Quickstart: send your first OTP in two HTTP calls',
  description:
    'From an empty server to a verified one-time password. Install the gateway, issue an API key, then send and verify with curl, Node or Python. Includes the four errors worth handling on day one.',
  keywords: [
    'OTP API quickstart',
    'send OTP curl',
    'verify OTP API example',
    'phone verification API tutorial',
    'OTP integration node python'
  ],
  alternates: { canonical: '/docs/quickstart' },
  openGraph: {
    title: 'Quickstart: send your first OTP in two HTTP calls',
    description:
      'Install, issue a key, then send and verify with curl, Node or Python. Plus the four errors worth handling on day one.',
    url: `${SITE_URL}/docs/quickstart`,
    siteName: 'WOTP',
    type: 'article'
  }
};

const SEND = `curl -X POST "$WOTP_API/v1/otp/send" \\
  -H "X-Api-Key: $WOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210"}'`;

const VERIFY = `curl -X POST "$WOTP_API/v1/otp/verify" \\
  -H "X-Api-Key: $WOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210", "code": "123456"}'`;

const NODE = `// Node 18+. The key stays on the server: never ship it to a browser.
const r = await fetch(process.env.WOTP_API + '/v1/otp/send', {
  method: 'POST',
  headers: {
    'X-Api-Key': process.env.WOTP_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ to: '919876543210', channel: 'whatsapp' })
});

const sent = await r.json();
if (!r.ok) {
  if (sent.error === 'user_not_linked') return showConnectTelegram(sent.link_url);
  if (r.status === 429) {
    // The response tells you exactly how long to wait. Do not guess.
    return setTimeout(retry, Number(r.headers.get('Retry-After')) * 1000);
  }
  if (sent.retryable === false) return tellUserToCheckTheNumber();
  throw new Error(sent.error);
}

// Build the countdown from the response, not a hardcoded 300.
startTimer(sent.expires_in);`;

const PYTHON = `# Python 3.11+ with httpx
import os, httpx

r = httpx.post(
    f"{os.environ['WOTP_API']}/v1/otp/send",
    headers={"X-Api-Key": os.environ["WOTP_KEY"]},
    json={"to": "919876543210", "channel": "whatsapp"},
    timeout=30,  # the gateway itself waits up to ~15s on the provider
)
r.raise_for_status()
sent = r.json()
start_timer(sent["expires_in"])`;

export default function QuickstartPage() {
  return (
    <DocsShell
      current='/docs/quickstart'
      eyebrow='docs · quickstart'
      title={
        <>
          <em>two</em> calls, and one of them is a formality.
        </>
      }
      lede='There is no SDK to learn and no webhook to host. You post a phone number, you post the code the user typed, and you branch on four error cases. This page is the whole integration.'
      actions={
        <>
          <Link href='/try' className='lm-actions__primary'>
            or run it in the browser first
          </Link>
          <Link href='/docs/self-hosting' className='lm-actions__ghost'>
            install it
          </Link>
        </>
      }
    >
      <h2 id='prereqs'>Before you start</h2>
      <ul>
        <li>
          A running gateway and its base URL. If you do not have one yet,{' '}
          <Link href='/docs/self-hosting'>self-hosting</Link> takes about ten minutes.
        </li>
        <li>
          An API key from the dashboard, under <strong>api keys</strong>.
        </li>
        <li>
          At least one channel configured by the operator: a Meta WhatsApp Business account (
          <Link href='/docs/whatsapp'>whatsapp</Link>) or a Telegram bot (
          <Link href='/docs/telegram'>telegram</Link>).
        </li>
      </ul>
      <p>
        Put the base URL and the key in environment variables. A key in source, in a log, or in a
        client bundle is a leaked key, and it is a spending credential.
      </p>

      <h2 id='send'>1 · send a code</h2>
      <pre className='lm-code'>{SEND}</pre>
      <p>
        The only required field is <code>to</code>. Formatting is forgiving: <code>+</code>, spaces
        and dashes are ignored, a bare 10-digit number is read as India, and a leading trunk{' '}
        <code>0</code> is dropped. Send <code>&quot;channel&quot;: &quot;telegram&quot;</code> to
        use the free channel instead.
      </p>
      <p>The response carries everything your UI needs:</p>
      <pre className='lm-code'>{`{
  "ok": true,
  "channel": "whatsapp",
  "request_id": "m8f3k2m9xq01zb4",
  "message_id": "wamid.XXXXXXXXXX",
  "expires_in": 300,
  "used": 42,
  "limit": 500,
  "reset_utc": "2026-10-01T00:00:00Z"
}`}</pre>
      <ul>
        <li>
          <strong>
            Build the countdown from <code>expires_in</code>
          </strong>
          , not a hardcoded 300. The operator can change it.
        </li>
        <li>
          <strong>
            Keep <code>request_id</code>.
          </strong>{' '}
          It is the fastest way to locate the send in the audit log when a user says nothing
          arrived.
        </li>
        <li>
          Give your HTTP client a timeout of at least 30 seconds. The gateway waits up to about 15
          on the provider.
        </li>
      </ul>

      <h2 id='verify'>2 · verify the code</h2>
      <pre className='lm-code'>{VERIFY}</pre>
      <p>
        A success is exactly <code>{'{ "ok": true, "verified": true }'}</code>. Act on that and
        nothing else. Never treat &ldquo;the user says they got it&rdquo; as verification.
      </p>
      <p>Two behaviours surprise people, and both are deliberate:</p>
      <ul>
        <li>
          <strong>Codes are single-use.</strong> A code dies the moment it verifies. Verifying the
          same code twice returns <code>code_expired</code> on the second call, even though the
          first call succeeded.
        </li>
        <li>
          <strong>Only the newest code counts.</strong> If you send twice for one screen, the first
          code stops working. Do not send twice; if you must, tell the user to use the newest
          message.
        </li>
      </ul>

      <h2 id='errors'>3 · handle these four</h2>
      <p>
        Everything else can wait until you need it. These four cannot, because each one has a
        different correct response and getting it wrong produces either a stuck user or a retry
        storm.
      </p>
      <ul>
        <li>
          <strong>
            409 <code>user_not_linked</code>
          </strong>{' '}
          (telegram only). The phone has never spoken to your bot, so the message bounced. Show a
          button that opens the <code>link_url</code> from the response, then retry{' '}
          <em>the same send</em>. The bounce cost nothing.
        </li>
        <li>
          <strong>429</strong> (three flavours: <code>rate_limited</code>,{' '}
          <code>phone_throttled</code>, <code>quota_exceeded</code>). Sleep for the{' '}
          <code>Retry-After</code> header. The header is authoritative and differs per flavour, from
          60 seconds to the rest of the month.
        </li>
        <li>
          <strong>
            502 <code>delivery_failed</code>
          </strong>
          . Read <code>retryable</code> before you do anything. <code>true</code> means a transient
          provider hiccup, so retry with backoff. <code>false</code> means the provider will refuse
          again: the number is not on WhatsApp, or the chat is blocked. Do not retry; tell the user
          to check the number.
        </li>
        <li>
          <strong>400</strong>. Your request is wrong. Retrying it unchanged changes nothing.
        </li>
      </ul>
      <p>
        One more rule that covers the rest: <strong>never retry a 4xx, do retry a 503</strong>. And
        send an <code>Idempotency-Key</code> header on every send, which makes a retry safe even in
        the one case where the message was delivered but the gateway failed to record it.
      </p>

      <h2 id='full-flow'>The whole flow, in Node and Python</h2>
      <p>Sending is the short part. The error branches are the integration.</p>
      <pre className='lm-code'>{NODE}</pre>
      <pre className='lm-code'>{PYTHON}</pre>

      <h2 id='next'>Next</h2>
      <ul>
        <li>
          <Link href='/docs/api'>API reference</Link>: every endpoint, field and error code.
        </li>
        <li>
          <Link href='/docs/whatsapp'>WhatsApp setup</Link>: the Meta work that has to happen before
          any of this sends a real message.
        </li>
        <li>
          <Link href='/docs/faq'>FAQ</Link>: the questions that decide whether this fits your
          project.
        </li>
      </ul>
    </DocsShell>
  );
}
