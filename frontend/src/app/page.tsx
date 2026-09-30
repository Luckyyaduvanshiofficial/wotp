import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyButton } from '@/features/landing/components/copy-button';
import { DialApparatus } from '@/features/landing/components/dial-apparatus';
import { GITHUB_URL } from '@/features/landing/components/github-star';
import { Ruler } from '@/features/landing/components/ruler';
import { SiteNav } from '@/features/landing/components/site-nav';

export const metadata: Metadata = {
  title: 'wa otp — self-hosted whatsapp & telegram otp gateway',
  description:
    'open source, self-hostable otp gateway. two api calls send and verify a code over your own whatsapp business account or your own telegram bot. you run it, you own the database.'
};

/*
 * Two calls, and that is the whole integration surface — the shapes below are
 * copied verbatim from backend/docs/api.md §1, with the host and key left as
 * shell variables.
 */
const SEND_CALL = `curl -X POST "$WAOTP_API/v1/otp/send" \\
  -H "X-Api-Key: $WAOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210", "channel": "telegram"}'`;

const VERIFY_CALL = `curl -X POST "$WAOTP_API/v1/otp/verify" \\
  -H "X-Api-Key: $WAOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "919876543210", "code": "123456"}'`;

/*
 * Every figure here is one a reader can re-derive from the repository. No
 * pricing, no "free messages" — the software is free, the messaging is not.
 */
const STATS = [
  { fig: '2', label: 'api calls: send a code, then verify it' },
  { fig: '0', label: 'services of ours you have to depend on' },
  { fig: '86 / 86', label: 'backend tests passing, no network needed' }
];

/*
 * Meta's own requirements for a production WhatsApp Business account. These
 * apply to whoever owns the account — which, in this model, is you. Stated
 * plainly because discovering them after buying a VPS is the expensive way.
 */
const META_REQUIREMENTS = [
  {
    key: '01 · official business verification',
    value:
      'meta requires certified government documents (gst registration or certificate of incorporation) matching the legal business entity name to approve a production business manager.'
  },
  {
    key: '02 · international credit card',
    value:
      'meta billing demands an international credit card supporting recurring auto-debit. indian domestic debit cards and rupay cards fail due to rbi e-mandate rules.'
  },
  {
    key: '03 · dedicated phone number',
    value:
      'the production whatsapp number must be a clean sim completely unattached from personal or business whatsapp mobile apps.'
  },
  {
    key: '04 · authentication template review',
    value:
      'custom one-time password templates with copy-code buttons are locked behind full corporate kyc before public delivery is unlocked.'
  }
];

const FACTS = [
  {
    key: 'stack',
    value:
      'fastapi (python) for the hot path, pocketbase for database, auth and back office, next.js for the dashboard. pocketbase is a single lightweight binary.'
  },
  {
    key: 'two channels',
    value:
      'telegram uses a bot token you create with botfather — no business verification involved. whatsapp uses your own meta business account and cloud api credentials.'
  },
  {
    key: 'limits are data',
    value:
      'quotas, code expiry, attempt thresholds, per-key / per-ip / per-phone throttles and resend cooldowns live in one database row you can edit without redeploying.'
  },
  {
    key: 'no telemetry',
    value:
      'the application reports nothing to anyone. no analytics, no phone-home, no usage reporting to the authors. what happens on your box stays on your box.'
  }
];

export default function LandingPage() {
  return (
    <div className='lm lm-shell'>
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-hero'>
        <div className='lm-hero__body'>
          <p className='lm-eyebrow'>01 · open source, self-hosted</p>
          <h1 className='lm-display'>
            <em>send</em> otp on whatsapp & telegram from your own account.
          </h1>
          <p className='lm-lede'>
            a complete otp gateway you run yourself: fastapi hot path, pocketbase control plane,
            next.js dashboard. clone it, point it at your own whatsapp business account or your own
            telegram bot, and send your first code tonight. the software is free — the messaging
            account and the server are yours to arrange.
          </p>
          <div className='lm-actions'>
            <Link href='/docs' className='lm-actions__primary'>
              read the docs
            </Link>
            {GITHUB_URL ? (
              <a href={GITHUB_URL} target='_blank' rel='noreferrer' className='lm-actions__ghost'>
                view on github
              </a>
            ) : null}
          </div>
        </div>
        <div className='lm-hero__foot'>
          <Ruler />
          <DialApparatus />
        </div>
      </header>

      <main>
        <section className='lm-section' id='calls' aria-labelledby='calls-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>02 · how it works</p>
            <h2 className='lm-h2' id='calls-h'>
              one endpoint sends a code. one endpoint checks it.
            </h2>
            <p className='lm-lede'>
              both accept json and return json. your api key travels in the X-Api-Key header, never
              in query parameters, so it remains private and out of logs. the code itself is never
              returned in any response — it only ever leaves via the channel.
            </p>
          </div>

          <div className='lm-specs'>
            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>post /v1/otp/send</h3>
                <p className='lm-spec__note'>expires_in 300 s</p>
              </div>
              <pre className='lm-code'>{SEND_CALL}</pre>
              <CopyButton value={SEND_CALL} label='copy the send call' />
            </article>

            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>post /v1/otp/verify</h3>
                <p className='lm-spec__note'>verified true</p>
              </div>
              <pre className='lm-code'>{VERIFY_CALL}</pre>
              <CopyButton value={VERIFY_CALL} label='copy the verify call' />
            </article>
          </div>
        </section>

        <section className='lm-section' id='channels' aria-labelledby='channels-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>03 · both channels, your accounts</p>
            <h2 className='lm-h2' id='channels-h'>
              both channels are implemented. each needs an account that belongs to you.
            </h2>
            <p className='lm-lede'>
              nothing here is shared with the authors or with any other installation. there is no
              central service in the middle, because there is no central service at all.
            </p>
          </div>

          <div className='lm-specs'>
            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>telegram · a bot token is enough</h3>
                <p className='lm-spec__note'>no business verification</p>
              </div>
              <p className='lm-spec__desc text-sm text-muted-foreground'>
                create a bot with botfather, put its token in .env, and the telegram channel works.
                no business verification, no credit card, no template approval. users link your bot
                with one click and receive codes immediately. telegram does not charge for bot api
                messages — your server does cost money, and that part is yours.
              </p>
            </article>

            <article className='lm-spec'>
              <div className='lm-spec__head'>
                <h3 className='lm-spec__route'>whatsapp · your cloud api account</h3>
                <p className='lm-spec__note'>graph api, version configurable</p>
              </div>
              <p className='lm-spec__desc text-sm text-muted-foreground'>
                the cloud api path is complete: authentication templates with the copy-code button,
                sandbox and production shapes, delivery-status webhooks and signature verification,
                and the access token encrypted at rest. you supply META_PHONE_NUMBER_ID and
                META_ACCESS_TOKEN from your own app. meta bills per conversation at their own rates
                — this project does not pay for, price, or resell messaging.
              </p>
            </article>
          </div>
        </section>

        <section
          className='lm-section'
          id='meta-requirements'
          aria-labelledby='meta-requirements-h'
        >
          <div className='lm-head'>
            <p className='lm-eyebrow'>04 · what meta will ask you for</p>
            <h2 className='lm-h2' id='meta-requirements-h'>
              the requirements are meta&apos;s, and they apply to you now.
            </h2>
            <p className='lm-lede'>
              under the old hosted model these hurdles belonged to whoever ran the shared line. in
              this model they belong to you, because the account is yours. if your company already
              has an approved business account you can skip this section entirely. if you are
              starting from nothing, this is the real work ahead — documented in facebook help doc
              159334372093366.
            </p>
          </div>

          <dl className='lm-facts'>
            {META_REQUIREMENTS.map(({ key, value }) => (
              <div className='lm-facts__item' key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className='lm-section' id='limits' aria-labelledby='limits-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>05 · numbers & limits</p>
            <h2 className='lm-h2' id='limits-h'>
              limits are data, not code.
            </h2>
            <p className='lm-lede'>
              quotas, expiry, attempt thresholds and throttles live in a single database row you can
              edit without redeploying. the monthly send cap defaults to no cap at all: you are
              sending from your own account, so a limit exists only as a runaway-spend guard you
              choose to set.
            </p>
          </div>

          <div className='lm-stats'>
            {STATS.map(({ fig, label }) => (
              <div key={label}>
                <p className='lm-stat__fig'>{fig}</p>
                <p className='lm-stat__label'>{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className='lm-section' id='storage' aria-labelledby='storage-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>06 · cryptographic security</p>
            <h2 className='lm-h2' id='storage-h'>
              codes and api keys are hashed. the phone number is not.
            </h2>
            <p className='lm-lede'>
              one-time codes and api keys are stored only as sha256 digests, and codes are generated
              with a csprng. an operator inspecting the database sees hashes, never plaintext
              secrets. meta and telegram tokens are fernet-encrypted at rest. phone numbers remain
              raw so delivery and verification can be matched.
            </p>
          </div>
        </section>

        <section className='lm-section' id='disclaimer' aria-labelledby='disclaimer-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>07 · what this project is not</p>
            <h2 className='lm-h2' id='disclaimer-h'>
              you are the service provider. this repository is the software.
            </h2>
          </div>

          <p className='lm-lede'>
            This project provides the software only. It does not provide WhatsApp messaging
            infrastructure, WhatsApp Business accounts, Meta credentials, phone numbers, hosting, or
            message credits.
          </p>

          <dl className='lm-facts'>
            <div className='lm-facts__item'>
              <dt>no messaging is included</dt>
              <dd>
                whatsapp messaging is not free, and this project does not make it free or bypass
                meta. message volume, conversation pricing and template approval are meta&apos;s
                rules, enforced against your account.
              </dd>
            </div>
            <div className='lm-facts__item'>
              <dt>no hosted fallback exists</dt>
              <dd>
                there is no server of ours to reach, no domain of ours to resolve, and no shared
                database. if this installation stops, it stops on your machine and nothing here
                breaks anywhere else.
              </dd>
            </div>
            <div className='lm-facts__item'>
              <dt>no signup</dt>
              <dd>
                the dashboard is operator-only. the first account is created on your own server with
                scripts/create_admin.py, and after that no one can register.
              </dd>
            </div>
          </dl>
        </section>

        <section className='lm-section' id='selfhost' aria-labelledby='selfhost-h'>
          <div className='lm-head'>
            <p className='lm-eyebrow'>08 · self-host</p>
            <h2 className='lm-h2' id='selfhost-h'>
              clone it. you own the database, the logs and the numbers.
            </h2>
            <p className='lm-lede'>
              the entire repository is open source under a permissive licence. run it on your own
              vps, or on one of the free tiers if you do not have one — the deployment guide covers
              both. there is no account with us to create, because there is nothing to sign up for.
            </p>
          </div>

          <dl className='lm-facts'>
            {FACTS.map(({ key, value }) => (
              <div className='lm-facts__item' key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className='lm-section lm-section--close' aria-labelledby='start-h'>
          <h2 className='lm-h2' id='start-h'>
            clone the repository and send your first code.
          </h2>
          <div className='lm-actions'>
            <Link href='/docs' className='lm-actions__primary'>
              read the docs
            </Link>
            {GITHUB_URL ? (
              <a href={GITHUB_URL} target='_blank' rel='noreferrer' className='lm-actions__ghost'>
                view on github
              </a>
            ) : null}
          </div>
        </section>
      </main>

      <footer className='lm-foot'>
        <p className='lm-foot__stmt'>send a code. check a code. keep the data.</p>
        <div className='lm-foot__meta'>
          <span>wa otp</span>
          <span>built in india</span>
          <span>open source</span>
          {GITHUB_URL ? (
            <a href={GITHUB_URL} target='_blank' rel='noreferrer'>
              github
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
