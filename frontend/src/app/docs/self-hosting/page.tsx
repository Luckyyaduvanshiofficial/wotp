import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsShell } from '@/features/docs/docs-shell';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Self-hosting: Docker Compose, TLS and backups',
  description:
    'Run the OTP gateway on your own server in about ten minutes. Docker Compose, the credentials production refuses to boot without, a reverse proxy for TLS, backups that survive a restore drill, and a single-command upgrade.',
  keywords: [
    'self hosted OTP gateway',
    'self host OTP API docker',
    'docker compose OTP service',
    'open source OTP server',
    'self hosted phone verification'
  ],
  alternates: { canonical: '/docs/self-hosting' },
  openGraph: {
    title: 'Self-hosting: Docker Compose, TLS and backups',
    description:
      'Ten minutes to a running gateway: compose, the production boot checks, TLS, backups and upgrades.',
    url: `${SITE_URL}/docs/self-hosting`,
    siteName: 'WOTP',
    type: 'article'
  }
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'Self-hosting the OTP gateway with Docker Compose',
  url: `${SITE_URL}/docs/self-hosting`,
  about: ['Docker Compose', 'self-hosting', 'reverse proxy', 'backups'],
  isPartOf: { '@type': 'WebSite', name: 'WOTP', url: SITE_URL }
};

export default function SelfHostingDocsPage() {
  return (
    <DocsShell
      current='/docs/self-hosting'
      eyebrow='docs · self-hosting'
      title={
        <>
          it runs on a <em>four</em> dollar box.
        </>
      }
      lede='Three containers, no external services, no account anywhere. Docker Compose, a reverse proxy for TLS, and a SQLite file you can back up by copying it. This page is the honest version, including the parts that will bite you.'
      actions={
        <>
          <Link href='/docs/quickstart' className='lm-actions__primary'>
            then integrate it
          </Link>
          <Link href='/try' className='lm-actions__ghost'>
            try it first
          </Link>
        </>
      }
    >
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h2 id='services'>What you are running</h2>
      <ul>
        <li>
          <strong>api</strong>: the FastAPI hot path your applications call.
        </li>
        <li>
          <strong>pocketbase</strong>: data store and the operator back office. Single SQLite file.
        </li>
        <li>
          <strong>web</strong>: the dashboard you sign in to.
        </li>
      </ul>
      <p>
        No Postgres, no Redis, no queue, no object storage. That is a deliberate constraint, not an
        accident, and it is why the whole stack fits on the smallest VPS you can rent.
      </p>

      <h2 id='run'>First run</h2>
      <pre className='lm-code'>{`git clone https://github.com/Luckyyaduvanshiofficial/wotp.git
cd wotp
cp .env.example .env

docker compose up -d

# There is no public signup. Create the operator account explicitly.
docker compose exec api python scripts/create_admin.py you@example.com`}</pre>
      <p>
        Then open the dashboard at <code>http://localhost:3000</code>, sign in, create an API key,
        and follow the onboarding checklist.
      </p>

      <h2 id='ports'>Every port binds to loopback, on purpose</h2>
      <p>
        Out of the box this stack is reachable from the machine it runs on and from nowhere else.
        That is deliberate. The PocketBase admin UI is the control plane for every credential the
        installation holds: it can read the encrypted Meta token, every API key hash and every audit
        row. It must not be one <code>docker compose up</code> away from the public internet.
      </p>
      <p>
        Reach it over an SSH tunnel when you need it, and put a TLS-terminating reverse proxy in
        front of the two services a browser actually needs:
      </p>
      <pre className='lm-code'>{`ssh -L 8090:127.0.0.1:8090 you@your-server
# then browse to http://localhost:8090/_/`}</pre>
      <p>
        <code>PB_BIND</code>, <code>API_BIND</code> and <code>WEB_BIND</code> override each bind
        address if you know exactly what you are exposing.
      </p>

      <h2 id='production'>What production refuses to boot without</h2>
      <p>
        Set <code>APP_ENV=production</code> and the API stops warning and starts refusing. It will
        not start when:
      </p>
      <ul>
        <li>
          <code>SECRET_KEY</code>, <code>WOTP_FERNET_KEY</code> or{' '}
          <code>PB_SUPERUSER_PASSWORD</code> is missing;
        </li>
        <li>
          <code>WOTP_MOCK_DELIVERY</code> is on, because that mode fakes delivery, and an install
          that believes it is live while faking delivery is the most dangerous state this software
          can be in;
        </li>
        <li>
          WhatsApp credentials are configured but <code>META_APP_SECRET</code> is empty, because
          without it inbound webhook calls cannot be signature-checked.
        </li>
      </ul>
      <p>
        These are refusals rather than warnings because every one of them is a silent security
        downgrade that nobody notices until it matters.
      </p>

      <h2 id='tls'>Putting TLS in front</h2>
      <p>
        Two hostnames, because the API and the dashboard are different origins and the API&rsquo;s
        CORS allowlist is a single exact origin.
      </p>
      <pre className='lm-code'>{`otp.example.com {
    reverse_proxy 127.0.0.1:3000
}

api.example.com {
    reverse_proxy 127.0.0.1:8000
}`}</pre>
      <p>
        Then set, in <code>.env</code>:
      </p>
      <pre className='lm-code'>{`APP_URL=https://api.example.com
DASHBOARD_ORIGIN=https://otp.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_APP_URL=https://otp.example.com
TRUST_PROXY_HEADERS=1`}</pre>
      <p>
        <code>TRUST_PROXY_HEADERS=1</code> makes the per-IP rate limiter read the right-most
        <code>X-Forwarded-For</code> entry, the one your proxy appends. Only turn it on when a proxy
        you control is in front. With the API exposed directly, that header is client-supplied and
        the limit becomes bypassable.
      </p>
      <p>
        The dashboard reads <code>NEXT_PUBLIC_*</code> at build time, so changing them needs{' '}
        <code>docker compose build web</code>, not just a restart.
      </p>

      <h2 id='backups'>Backups</h2>
      <p>
        <code>pb_data/</code> is the whole system of record: API key hashes, the OTP audit log,
        linked Telegram accounts, your settings and the encrypted provider tokens. Losing it means
        losing every key and every audit row.
      </p>
      <pre className='lm-code'>{`# /etc/cron.daily/wotp-backup
#!/bin/sh
set -eu
STAMP=$(date +%F)
docker run --rm \\
  -v wotp_pb_data:/data:ro \\
  -v /var/backups/wotp:/backup \\
  alpine tar czf "/backup/pb_data-$STAMP.tgz" -C /data .
find /var/backups/wotp -name 'pb_data-*.tgz' -mtime +30 -delete`}</pre>
      <p>
        <strong>Do a restore drill before you rely on it.</strong> An untested backup is a
        hypothesis. The full restore procedure is in the repository, and it takes about a minute.
      </p>
      <p>
        Rotating <code>WOTP_FERNET_KEY</code> makes previously stored provider tokens undecryptable.
        Back that key up with the data, or be ready to re-enter the Meta token and the bot token
        afterwards.
      </p>

      <h2 id='upgrades'>Upgrades</h2>
      <pre className='lm-code'>{`git pull
docker compose build
docker compose up -d`}</pre>
      <p>
        PocketBase applies new migrations on start. They are written to be idempotent and guarded,
        but take a backup first anyway: the migration that carries data forward cannot always carry
        it back.
      </p>

      <h2 id='operations'>Monitoring and retention</h2>
      <ul>
        <li>
          <code>GET /health</code> is liveness and always returns 200.{' '}
          <code>GET /health/ready</code> is the one that matters: it returns 503 when the store is
          unreachable, and reports provider configuration state <em>by variable name</em>, never by
          value.
        </li>
        <li>
          <code>scripts/cleanup.py</code> prunes expired codes and old audit rows. It refuses to
          delete anything from the current UTC month, because those rows are what the monthly cap
          counts. Run it from cron with <code>--dry-run</code> the first time.
        </li>
        <li>
          Alert on a failure-rate spike in the <code>messages</code> collection. It is the earliest
          signal of both a provider policy problem and an abuse attempt.
        </li>
      </ul>

      <h2 id='scale'>One process, and the honest reason</h2>
      <p>
        Run the API with <code>--workers 1</code>. That is a correctness requirement rather than a
        tuning knob: the send and verify locks, the idempotency store, the rate limiters and the
        cached PocketBase token are all process-global. Two workers silently break idempotency, let
        two concurrent sends pass the same quota check, and halve every rate limit.
      </p>
      <p>
        For the scale this software is built for, one worker is not the bottleneck. If you outgrow
        it, the fix is a shared store behind those four things, not more workers.
      </p>

      <h2 id='next'>Next</h2>
      <ul>
        <li>
          <Link href='/docs/whatsapp'>WhatsApp setup</Link> or{' '}
          <Link href='/docs/telegram'>Telegram setup</Link>, depending on your channel.
        </li>
        <li>
          <Link href='/docs/quickstart'>Quickstart</Link>: the integration itself.
        </li>
        <li>
          <Link href='/docs/faq'>FAQ</Link>: what it does not do, answered plainly.
        </li>
      </ul>
    </DocsShell>
  );
}
