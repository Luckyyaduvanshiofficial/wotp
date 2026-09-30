import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsShell } from '@/features/docs/docs-shell';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'WhatsApp OTP setup: Meta Cloud API and the authentication template',
  description:
    'What Meta requires before you can send one-time passwords on WhatsApp: business verification, a clean phone number, an authentication template with a copy-code button, a system user token and a signed webhook.',
  keywords: [
    'WhatsApp Cloud API OTP',
    'WhatsApp authentication template',
    'send OTP WhatsApp API',
    'Meta business verification OTP',
    'WhatsApp copy code button template',
    'WhatsApp OTP pricing'
  ],
  alternates: { canonical: '/docs/whatsapp' },
  openGraph: {
    title: 'WhatsApp OTP setup: Meta Cloud API and the authentication template',
    description:
      'Business verification, a clean number, the authentication template, a system-user token and a signed webhook.',
    url: `${SITE_URL}/docs/whatsapp`,
    siteName: 'WOTP',
    type: 'article'
  }
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'WhatsApp OTP setup with the Meta Cloud API',
  url: `${SITE_URL}/docs/whatsapp`,
  about: ['WhatsApp Cloud API', 'authentication template', 'business verification'],
  isPartOf: { '@type': 'WebSite', name: 'WOTP', url: SITE_URL }
};

export default function WhatsAppDocsPage() {
  return (
    <DocsShell
      current='/docs/whatsapp'
      eyebrow='docs · whatsapp'
      title={
        <>
          the <em>hard</em> channel, documented honestly.
        </>
      }
      lede='Telegram needs a token. WhatsApp needs a business. This page is the second one: what Meta actually requires, what the template has to look like, and why the failure modes are what they are. These are Meta rules, not this project&rsquo;s, and none of them can be worked around in code.'
      actions={
        <>
          <Link href='/docs/telegram' className='lm-actions__primary'>
            try the free channel instead
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

      <h2 id='credentials'>Two credentials, and they are different things</h2>
      <p>
        Confusing these is the most common setup mistake, so start here. One lets you send; the
        other lets you trust what comes back.
      </p>
      <ul>
        <li>
          <strong>Access token</strong> (<code>META_ACCESS_TOKEN</code>) authorises sending messages
          as your number.
        </li>
        <li>
          <strong>App secret</strong> (<code>META_APP_SECRET</code>) verifies that inbound delivery
          callbacks really came from Meta. Without it, anyone who learns your webhook URL can forge
          delivery statuses.
        </li>
      </ul>
      <p>
        This project refuses to start in production when WhatsApp credentials are configured and the
        app secret is missing, rather than warn and continue. A silent downgrade is worse than no
        boot.
      </p>

      <h2 id='steps'>What Meta requires</h2>
      <p>
        Meta&rsquo;s own interface moves around, so this describes the <em>requirements</em> rather
        than click paths. For the current UI, follow{' '}
        <a
          href='https://developers.facebook.com/docs/whatsapp/cloud-api/get-started'
          rel='noreferrer'
        >
          Meta&rsquo;s Cloud API documentation
        </a>
        .
      </p>

      <h3>A verified business</h3>
      <p>
        Sending production WhatsApp traffic needs a Meta Business account with completed
        verification: certified documents matching your legal entity, and an international card that
        supports recurring auto-debit. Indian domestic debit and RuPay cards commonly fail here
        because of RBI e-mandate rules.
      </p>

      <h3>A phone number that is not on WhatsApp</h3>
      <p>
        The number you register must not be active on the WhatsApp consumer app. If it is, it has to
        be deleted from WhatsApp first, and that is one-way. Use a dedicated SIM. There is no way
        around this, and any guide suggesting otherwise is misdescribing how Meta works.
      </p>

      <h3>An authentication template</h3>
      <p>
        This is the message your users actually receive. It must be category{' '}
        <strong>authentication</strong>, and it needs two things:
      </p>
      <ul>
        <li>a body containing one variable: the code</li>
        <li>
          a <strong>Copy Code</strong> button bound to that same variable
        </li>
      </ul>
      <p>
        The code is sent in both places, because that is what an authentication template requires in
        order to render its button. Then set the template&rsquo;s <strong>technical</strong> name,
        not its display name:
      </p>
      <pre className='lm-code'>{`META_TEMPLATE=your_template_name
META_TEMPLATE_LANG=en_US`}</pre>
      <p>
        If you edit the template later and remove the button, delivery starts failing. That is worth
        writing down somewhere your future self will look.
      </p>

      <h3>A permanent token</h3>
      <p>
        The token shown in the API setup panel expires in about a day and is for testing. For a real
        install, create a system user with the <code>whatsapp_business_messaging</code> permission
        and generate a token for it, so it does not expire out from under you.
      </p>

      <h3>A webhook that verifies signatures</h3>
      <p>Your callback URL is derived from your configured app URL:</p>
      <pre className='lm-code'>{`{APP_URL}/webhooks/whatsapp`}</pre>
      <p>
        Meta calls it once with a challenge during subscription, then posts delivery statuses to the
        same URL. Set a verify token you invent, subscribe to the <code>messages</code> field, and
        set the app secret so every callback is authenticated by its{' '}
        <code>X-Hub-Signature-256</code> header.
      </p>

      <h2 id='testing'>Testing before you have a verified business</h2>
      <p>
        Meta&rsquo;s test number is a genuinely useful sandbox: it delivers only to recipients you
        allow-list, which is exactly what you want while wiring a flow. Two things to know:
      </p>
      <ul>
        <li>
          <strong>Allow-list every recipient.</strong> A send to a number that is not on the list is
          rejected by Meta and surfaces here as <code>502 delivery_failed</code> with{' '}
          <code>retryable: false</code>. That flag is deliberate: retrying will not help.
        </li>
        <li>
          <strong>The sample template has a different shape.</strong> It takes three body parameters
          instead of one. If you are sending with Meta&rsquo;s sample template rather than your own,
          name it in <code>META_SANDBOX_TEMPLATE</code> and the gateway uses the matching payload
          shape. Leave it unset for any real install.
        </li>
      </ul>

      <h2 id='constraints'>The constraints that shape your product</h2>
      <p>
        These are Meta&rsquo;s rules. Each one has ended someone&rsquo;s launch, and none can be
        fixed in application code.
      </p>
      <ul>
        <li>
          <strong>Business-initiated messages need a template.</strong> Free-form text is only
          deliverable inside an open 24-hour customer service window. OTP sends are
          business-initiated, which is why the gateway always uses a template.
        </li>
        <li>
          <strong>Messaging limits are tiered.</strong> A new number starts on a low daily
          unique-recipient limit and climbs as its quality rating stays healthy. Plan a launch
          around this rather than discovering it during one.
        </li>
        <li>
          <strong>Meta bills you directly.</strong> See{' '}
          <a href='https://developers.facebook.com/docs/whatsapp/pricing' rel='noreferrer'>
            Meta&rsquo;s pricing
          </a>
          . This project does not resell messaging, bundle credits, or sit between you and that
          bill.
        </li>
        <li>
          <strong>A bad quality rating throttles or blocks you.</strong> Authentication-category
          traffic with a real user base is normally safe. Marketing-shaped content is what gets
          numbers flagged.
        </li>
      </ul>

      <h2 id='or-telegram'>Or skip all of it</h2>
      <p>
        Every requirement above is a WhatsApp requirement. Telegram needs one bot token, no business
        verification, no card and no approval process, and delivery is free. If you are building an
        internal tool, a side project, or anything that can ask its users to tap a link once,{' '}
        <Link href='/docs/telegram'>the Telegram channel</Link> is strictly easier and costs
        nothing.
      </p>
      <p>
        You can run both. The API takes a <code>channel</code> field, quota is metered against
        WhatsApp only, and moving traffic to Telegram is the documented way around a spent monthly
        cap.
      </p>

      <h2 id='next'>Next</h2>
      <ul>
        <li>
          <Link href='/docs/self-hosting'>Self-hosting</Link>: where these values go, and what
          production refuses to boot without.
        </li>
        <li>
          <Link href='/docs/api'>API reference</Link>: the <code>502 retryable</code> flag and every
          other error.
        </li>
        <li>
          <Link href='/try'>Try it in the browser</Link>: watch the provider rejection happen
          without waiting for a template approval.
        </li>
      </ul>
    </DocsShell>
  );
}
