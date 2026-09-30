'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getReadiness, webhookUrl } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function Command({ code }: { code: string }) {
  return (
    <div className='bg-muted/60 relative rounded-lg border pr-20'>
      <pre className='overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed'>{code}</pre>
      <CopyButton value={code} className='absolute top-2 right-2 h-7 px-2 text-xs' />
    </div>
  );
}

/**
 * A step is either checkable against real state this app can see, or it is a
 * one-time install action it cannot observe. Never render a tick we did not
 * earn — a checklist that lies is worse than no checklist.
 */
type StepState = 'done' | 'todo' | 'uncheckable';

function StateBadge({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <Badge variant='secondary' className='shrink-0'>
        <Icons.check className='size-3' />
        done
      </Badge>
    );
  }
  if (state === 'todo') {
    return (
      <Badge variant='outline' className='shrink-0 text-amber-500'>
        to do
      </Badge>
    );
  }
  return (
    <Badge variant='outline' className='text-muted-foreground shrink-0'>
      one-time
    </Badge>
  );
}

function Step({
  n,
  title,
  state,
  children
}: {
  n: number;
  title: string;
  state: StepState;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-start justify-between gap-4'>
          <span className='flex items-start gap-3'>
            <span className='bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold'>
              {n}
            </span>
            {title}
          </span>
          <StateBadge state={state} />
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4 text-sm'>{children}</CardContent>
    </Card>
  );
}

const SECRET_CMD =
  'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"';

export function OnboardingView() {
  const { data, isLoading } = useQuery({
    queryKey: ['readiness'],
    queryFn: getReadiness,
    refetchInterval: 60_000
  });

  const ready = data?.state === 'ready' ? data.data : null;
  const whatsappReady = ready?.whatsapp.configured ?? false;
  const telegramReady = ready?.telegram.configured ?? false;
  const verifyTokenSet = ready?.webhook.verify_token_configured ?? false;
  const signatureSet = ready?.webhook.signature_check_enabled ?? false;
  const webhookReady = verifyTokenSet && signatureSet;

  return (
    <div className='grid gap-4'>
      <Card className='border-primary/30 bg-primary/5'>
        <CardHeader>
          <CardTitle className='text-primary flex items-center gap-2'>
            <Icons.info className='size-4' />
            You provide your own WhatsApp Business account
          </CardTitle>
          <CardDescription className='text-muted-foreground leading-relaxed'>
            This is self-hosted software. There is no shared sender, no pooled number and no
            credentials to request from anyone: the WhatsApp Business account, the phone number and
            the Meta app are all yours, and so is the Meta bill. Start at step 1 — it is the only
            step with a waiting period, and every other step can be finished while you wait for it.
          </CardDescription>
        </CardHeader>
        {isLoading ? (
          <CardContent>
            <Skeleton className='h-4 w-64' />
          </CardContent>
        ) : (
          <CardContent className='flex flex-wrap gap-2'>
            <Badge variant={whatsappReady ? 'secondary' : 'outline'}>
              whatsapp {whatsappReady ? 'configured' : 'not configured'}
            </Badge>
            <Badge variant={telegramReady ? 'secondary' : 'outline'}>
              telegram {telegramReady ? 'configured' : 'not configured'}
            </Badge>
            <Badge variant={webhookReady ? 'secondary' : 'outline'}>
              webhook {webhookReady ? 'ready' : 'incomplete'}
            </Badge>
            {ready?.mock_delivery ? <Badge variant='outline'>mock delivery on</Badge> : null}
            {data?.state === 'degraded' ? (
              <Badge variant='destructive'>pocketbase unreachable</Badge>
            ) : null}
            {data?.state === 'unreachable' ? (
              <Badge variant='destructive'>api unreachable</Badge>
            ) : null}
          </CardContent>
        )}
      </Card>

      <Step
        n={1}
        title='Get your own WhatsApp Business account (or skip to Telegram)'
        state='uncheckable'
      >
        <p className='text-muted-foreground'>
          Meta requires government business documents, an international credit card, a dedicated
          phone number and an approved authentication template before a production number can send
          to the public. That approval can take days, which is why it goes first.
        </p>
        <p className='text-muted-foreground'>
          In a hurry? Telegram needs none of it — create a bot with @BotFather, paste its token into{' '}
          <code>backend/.env</code>, and you can deliver real codes today while Meta reviews your
          account.
        </p>
        <Button
          variant='outline'
          size='sm'
          render={
            <Link href='/docs'>
              Read the Meta setup guide
              <Icons.arrowRight className='size-3.5' />
            </Link>
          }
        />
      </Step>

      <Step n={2} title='Configure backend/.env' state='uncheckable'>
        <p className='text-muted-foreground'>
          Every credential belongs in this file. It is gitignored — never commit a filled-in copy.
        </p>
        <Command code={`cp backend/.env.example backend/.env`} />
        <p className='text-muted-foreground'>
          Generate the Fernet key (it encrypts provider tokens at rest) and a signing secret:
        </p>
        <Command code={SECRET_CMD} />
        <p className='text-muted-foreground'>
          Then fill in <code>META_PHONE_NUMBER_ID</code>, <code>META_ACCESS_TOKEN</code>,{' '}
          <code>META_VERIFY_TOKEN</code>, <code>META_APP_SECRET</code> and/or{' '}
          <code>TELEGRAM_BOT_TOKEN</code> + <code>TELEGRAM_BOT_USERNAME</code>. Every variable is
          documented inline in <code>.env.example</code>.
        </p>
      </Step>

      <Step n={3} title='Start the stack' state='uncheckable'>
        <p className='text-muted-foreground'>
          Docker Compose runs the API, PocketBase and the dashboard together. The database schema
          migrates itself on first boot — there is no separate migration step.
        </p>
        <Command code='docker compose up -d' />
        <p className='text-muted-foreground'>
          Prefer to run it by hand? Start PocketBase (<code>./pocketbase serve</code>), then the API
          with <code>.venv/bin/uvicorn app.main:app --port 8000</code>.
        </p>
      </Step>

      <Step n={4} title='Create your operator account' state='uncheckable'>
        <p className='text-muted-foreground'>
          There is no signup form, by design: a public signup would let any visitor mint an API key
          against your WhatsApp account. The first — and only — account is created here.
        </p>
        <Command code='.venv/bin/python scripts/create_admin.py you@example.com' />
        <p className='text-muted-foreground'>
          It reads the password from <code>WOTP_ADMIN_PASSWORD</code> if you omit it, which keeps
          the secret out of your shell history. Sign in at the dashboard with it afterwards. Running
          it again is safe and changes nothing.
        </p>
      </Step>

      <Step n={5} title='Create an API key for your app' state='uncheckable'>
        <p className='text-muted-foreground'>
          This key is what your own backend sends OTPs with. It is shown once and stored only as a
          hash — if you lose it, create another and deactivate the old one.
        </p>
        <Button
          variant='outline'
          size='sm'
          render={
            <Link href='/dashboard/keys'>
              Go to API Keys
              <Icons.arrowRight className='size-3.5' />
            </Link>
          }
        />
      </Step>

      <Step
        n={6}
        title='Point your provider at your webhook'
        state={webhookReady ? 'done' : 'todo'}
      >
        <p className='text-muted-foreground'>
          Delivery statuses arrive here. It is derived from the API origin you are talking to right
          now, so it can never drift from where the API actually is:
        </p>
        <Command code={webhookUrl()} />
        <p className='text-muted-foreground'>
          In your Meta app, subscribe this URL to the <code>messages</code> field and paste the same
          value as <code>META_VERIFY_TOKEN</code>. Meta will call it once with a challenge to
          confirm — this app echoes it back when the token matches.
        </p>
        <p className='text-muted-foreground'>
          For Telegram, register the webhook instead:{' '}
          <code>.venv/bin/python scripts/set_telegram_webhook.py https://your-api-host</code>
        </p>
        {!signatureSet ? (
          <p className='text-amber-500'>
            Signature checking is off. Without <code>META_APP_SECRET</code> set, anyone who learns
            this URL can post fake delivery statuses.
          </p>
        ) : null}
      </Step>

      <Step n={7} title='Send yourself a real code' state='uncheckable'>
        <p className='text-muted-foreground'>
          The Tester page uses a plaintext key exactly the way your production backend will, so a
          green result there means your integration is wired correctly.
        </p>
        {ready?.mock_delivery ? (
          <p className='text-amber-500'>
            Mock delivery is on, so nothing will actually arrive. Set{' '}
            <code>WOTP_MOCK_DELIVERY=0</code> and restart before testing for real.
          </p>
        ) : null}
        <Button
          variant='outline'
          size='sm'
          render={
            <Link href='/dashboard/tester'>
              Open the Tester
              <Icons.arrowRight className='size-3.5' />
            </Link>
          }
        />
      </Step>

      <p className='text-muted-foreground text-sm'>
        Tunable numbers — code length, expiry, attempts, throttles and the monthly send cap — live
        in the <code>settings</code> row of your own PocketBase, editable without a redeploy. See{' '}
        <Link href='/dashboard/settings' className='text-primary underline underline-offset-4'>
          Settings
        </Link>
        .
      </p>
    </div>
  );
}
