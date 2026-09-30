'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getUsage, listKeys, errorMessage, getReadiness, webhookUrl, API_URL } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TEMP_MAIL_ENABLED, TEMP_MAIL_URL, tempMailHost } from '@/lib/temp-mail';

function UsageCard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['usage'],
    queryFn: getUsage,
    retry: 1
  });

  if (isLoading) {
    return (
      <Card className='border shadow-sm'>
        <CardHeader className='p-4 sm:p-6 pb-2'>
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-8 w-48 mt-1' />
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-2 space-y-3'>
          <Skeleton className='h-2 w-full' />
          <Skeleton className='h-4 w-40' />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className='border shadow-sm'>
        <CardHeader className='p-4 sm:p-6 pb-2'>
          <CardTitle className='flex items-center gap-2 text-base font-semibold'>
            <Icons.warning className='size-4 text-destructive' />
            Couldn&apos;t load usage
          </CardTitle>
          <CardDescription className='text-xs'>{errorMessage(error)}</CardDescription>
        </CardHeader>
        <CardFooter className='p-4 sm:p-6 pt-2'>
          <Button variant='outline' size='sm' onClick={() => void refetch()} disabled={isFetching}>
            <Icons.refresh className='size-3.5 mr-1.5' />
            Retry
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // `limit` is this installation's own monthly send cap. 0 means the operator
  // set none, which is a legitimate configuration on a self-hosted box — not a
  // quota of zero — so it must not render as "0 / 0".
  const { used, limit, reset_utc } = data;
  const capped = limit > 0;
  const pct = capped ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const resetDate = new Date(reset_utc);
  const resetLabel = Number.isNaN(resetDate.getTime())
    ? reset_utc
    : resetDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Card className='border shadow-sm flex flex-col justify-between'>
      <CardHeader className='p-4 sm:p-6 pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-xs sm:text-sm font-medium text-muted-foreground'>
            Monthly WhatsApp Sends
          </CardTitle>
          <Badge variant={capped && pct >= 100 ? 'destructive' : 'secondary'} className='text-[11px]'>
            {capped ? 'capped' : 'no cap'}
          </Badge>
        </div>
        <div className='mt-1 flex items-baseline gap-2'>
          <span className='text-2xl sm:text-3xl font-bold tracking-tight tabular-nums'>
            {used.toLocaleString('en-IN')}
          </span>
          <span className='text-muted-foreground text-xs sm:text-sm'>
            {capped ? `/ ${limit.toLocaleString('en-IN')} cap` : 'OTPs delivered'}
          </span>
        </div>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 pt-0'>
        {capped ? (
          <>
            <Progress value={pct} aria-label={`${pct}% of monthly send cap used`} className='h-2' />
            <div className='mt-3 flex flex-wrap items-center justify-between gap-1 text-[11px] sm:text-xs text-muted-foreground'>
              <span>Resets on <strong className='text-foreground font-medium'>{resetLabel}</strong></span>
              <span className='font-mono'>{pct}% used</span>
            </div>
          </>
        ) : (
          <div className='mt-1 space-y-1.5'>
            <p className='text-muted-foreground text-xs leading-relaxed'>
              No monthly send cap is set. You can configure a runaway-spend limit in Meta settings.
            </p>
            <p className='text-[11px] text-muted-foreground'>
              Cycle resets on <span className='text-foreground font-medium'>{resetLabel}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TelegramChannelCard() {
  return (
    <Card className='border shadow-sm flex flex-col justify-between'>
      <CardHeader className='p-4 sm:p-6 pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
            <Icons.telegram className='size-4 text-sky-500' />
            Telegram OTP Channel
          </CardTitle>
          <Badge variant='outline' className='border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[11px]'>
            Free Forever
          </Badge>
        </div>
        <div className='mt-1'>
          <span className='text-2xl sm:text-3xl font-bold tracking-tight text-sky-600 dark:text-sky-400'>
            Unmetered
          </span>
        </div>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 pt-0'>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          Instant delivery via Telegram Bot API without template approvals or billing constraints.
        </p>
        <div className='mt-3'>
          <Link
            href='/dashboard/tester'
            className='inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline'
          >
            <span>Test on your phone</span>
            <Icons.arrowRight className='size-3' />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function KeysCountCard() {
  const { data, isLoading } = useQuery({ queryKey: ['keys'], queryFn: listKeys });
  const count = data?.keys?.length ?? 0;
  const activeCount = data?.keys?.filter((k) => k.active).length ?? 0;

  return (
    <Card className='border shadow-sm flex flex-col justify-between'>
      <CardHeader className='p-4 sm:p-6 pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
            <Icons.key className='size-4 text-primary' />
            Developer API Keys
          </CardTitle>
          <Badge variant='secondary' className='text-[11px]'>
            {activeCount} Active
          </Badge>
        </div>
        <div className='mt-1'>
          <span className='text-2xl sm:text-3xl font-bold tracking-tight tabular-nums'>
            {isLoading ? '…' : count}
          </span>
          <span className='text-muted-foreground text-xs sm:text-sm ml-1.5'>
            {count === 1 ? 'key created' : 'keys created'}
          </span>
        </div>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 pt-0'>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          Pass your secret key in the <code className='text-[11px] font-mono bg-muted px-1 py-0.5 rounded'>X-Api-Key</code> header.
        </p>
        <div className='mt-3'>
          <Link
            href='/dashboard/keys'
            className='inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline'
          >
            <span>Manage API keys</span>
            <Icons.arrowRight className='size-3' />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function SandboxPromoCard() {
  return (
    <Card className='border shadow-sm flex flex-col justify-between border-primary/20 bg-primary/[0.02]'>
      <CardHeader className='p-4 sm:p-6 pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5'>
            <Icons.flask className='size-4 text-primary' />
            Interactive OTP Tester
          </CardTitle>
          <Badge variant='outline' className='border-primary/30 bg-primary/10 text-primary text-[11px]'>
            Sandbox
          </Badge>
        </div>
        <div className='mt-1'>
          <span className='text-xl sm:text-2xl font-bold tracking-tight text-foreground'>
            Live Testing Console
          </span>
        </div>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 pt-0'>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          Dispatch and verify OTP codes on WhatsApp or Telegram with zero setup code.
        </p>
        <div className='mt-3'>
          <Link
            href='/dashboard/tester'
            className='inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline'
          >
            <span>Launch OTP Tester</span>
            <Icons.arrowRight className='size-3' />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelRow({
  label,
  configured,
  detail,
  icon
}: {
  label: string;
  configured: boolean;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className='flex items-start justify-between gap-4 border-b py-2.5 last:border-b-0'>
      <div className='flex items-start gap-2.5'>
        <span className='text-muted-foreground mt-0.5'>{icon}</span>
        <div>
          <p className='text-xs sm:text-sm font-medium text-foreground'>{label}</p>
          <p className='text-muted-foreground text-xs leading-relaxed'>{detail}</p>
        </div>
      </div>
      <Badge variant={configured ? 'secondary' : 'outline'} className='text-[10px] shrink-0'>
        {configured ? 'configured' : 'not configured'}
      </Badge>
    </div>
  );
}

function InstallationStatusCard() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['readiness'],
    queryFn: getReadiness,
    refetchInterval: 60_000,
    retry: 1
  });

  if (isLoading) {
    return (
      <Card className='border shadow-sm'>
        <CardHeader className='p-4 sm:p-6 pb-3'>
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-4 w-64 mt-1' />
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-0 space-y-2.5'>
          <Skeleton className='h-12 w-full rounded-md' />
          <Skeleton className='h-12 w-full rounded-md' />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.state === 'unreachable') {
    return (
      <Card className='border shadow-sm border-destructive/30'>
        <CardHeader className='p-4 sm:p-6 pb-2'>
          <CardTitle className='flex items-center gap-2 text-base font-semibold text-destructive'>
            <Icons.warning className='size-4' />
            Installation Status Unknown
          </CardTitle>
          <CardDescription className='text-xs'>
            {data?.state === 'unreachable'
              ? data.message
              : 'Could not reach the backend API to check installation readiness.'}
          </CardDescription>
        </CardHeader>
        <CardFooter className='p-4 sm:p-6 pt-2'>
          <Button variant='outline' size='sm' onClick={() => void refetch()} disabled={isFetching}>
            <Icons.refresh className='size-3.5 mr-1.5' />
            Retry Check
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (data.state === 'degraded') {
    return (
      <Card className='border shadow-sm border-destructive/40'>
        <CardHeader className='p-4 sm:p-6 pb-2'>
          <CardTitle className='flex items-center gap-2 text-base font-semibold text-destructive'>
            <Icons.warning className='size-4' />
            Control Plane Unreachable
          </CardTitle>
          <CardDescription className='text-xs leading-relaxed'>
            The API is running but PocketBase did not respond, so no OTP can be sent or verified
            until it is back. Check that PocketBase is running and that <code>PB_URL</code> in{' '}
            <code>backend/.env</code> is reachable.
          </CardDescription>
        </CardHeader>
        <CardFooter className='p-4 sm:p-6 pt-2'>
          <Button variant='outline' size='sm' onClick={() => void refetch()} disabled={isFetching}>
            <Icons.refresh className='size-3.5 mr-1.5' />
            Re-check
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const ready = data.data;
  if (!ready) return null;

  const { whatsapp, telegram, webhook, mock_delivery } = ready;
  const whatsappDetail = whatsapp.configured
    ? whatsapp.detail
    : whatsapp.missing.length > 0
      ? `Missing: ${whatsapp.missing.join(', ')}`
      : whatsapp.detail;

  return (
    <Card className='border shadow-sm'>
      <CardHeader className='p-4 sm:p-6 pb-3 border-b bg-muted/20'>
        <div className='flex items-center justify-between gap-2'>
          <div>
            <CardTitle className='text-base font-semibold flex items-center gap-2'>
              <span className='size-2.5 rounded-full bg-emerald-500' />
              Installation & Delivery Status
            </CardTitle>
            <CardDescription className='text-xs mt-0.5'>
              Real-time health of your self-hosted WhatsApp, Telegram, and database connections
            </CardDescription>
          </div>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => void refetch()}
            disabled={isFetching}
            className='h-7 px-2 text-xs'
          >
            <Icons.refresh className={cn('size-3.5 mr-1', isFetching && 'animate-spin')} />
            {isFetching ? 'Checking…' : 'Re-check'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 space-y-4'>
        {mock_delivery ? (
          <div className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-3'>
            <p className='flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-400'>
              <Icons.warning className='size-4 shrink-0' />
              Mock Delivery is Active
            </p>
            <p className='mt-1 text-xs text-muted-foreground leading-relaxed'>
              Sends are simulated: database records are written but no WhatsApp or Telegram message leaves this host.
              Set <code>WAOTP_MOCK_DELIVERY=0</code> and restart containers to enable live delivery.
            </p>
          </div>
        ) : null}

        <div className='rounded-lg border divide-y'>
          <div className='px-3.5'>
            <ChannelRow
              label='WhatsApp (Meta Cloud API)'
              icon={<Icons.whatsapp className='size-4 text-emerald-600' />}
              configured={whatsapp.configured}
              detail={whatsappDetail}
            />
          </div>
          <div className='px-3.5'>
            <ChannelRow
              label='Telegram (Bot API)'
              icon={<Icons.telegram className='size-4 text-sky-500' />}
              configured={telegram.configured}
              detail={telegram.detail}
            />
          </div>
        </div>

        <div className='rounded-lg border bg-muted/40 p-3.5 space-y-2'>
          <div className='flex items-center justify-between gap-2'>
            <p className='text-xs font-semibold text-foreground uppercase tracking-wider'>Meta Webhook Integration</p>
            <span className='text-[11px] text-muted-foreground font-mono'>Inbound Callbacks</span>
          </div>
          <dl className='space-y-1.5 text-xs text-muted-foreground'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <dt>Verify Token</dt>
              <dd className={cn('font-medium', webhook.verify_token_configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500')}>
                {webhook.verify_token_configured ? '✓ configured' : '✗ not set — Meta cannot subscribe'}
              </dd>
            </div>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <dt>Signature Verification</dt>
              <dd className={cn('font-medium', webhook.signature_check_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500')}>
                {webhook.signature_check_enabled
                  ? '✓ enabled (SHA-256 HMAC)'
                  : '✗ disabled — set META_APP_SECRET to verify callbacks'}
              </dd>
            </div>
            <div className='flex flex-wrap items-center justify-between gap-2 pt-1 border-t'>
              <dt>Public Webhook URL</dt>
              <dd className='text-foreground font-mono text-[11px] bg-background px-1.5 py-0.5 rounded border select-all max-w-full truncate'>
                {webhookUrl()}
              </dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}

function FirstRunChecklistCard() {
  return (
    <Card className='border shadow-sm flex flex-col justify-between border-primary/20 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent'>
      <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-sm sm:text-base font-semibold flex items-center gap-2 text-foreground'>
            <Icons.check className='size-4 text-primary' />
            First-Run Checklist
          </CardTitle>
          <Badge variant='outline' className='text-[10px] border-primary/30 text-primary'>
            Onboarding
          </Badge>
        </div>
        <CardDescription className='text-xs mt-1 leading-relaxed'>
          Follow 7 step-by-step instructions to configure Meta Cloud API, Telegram bot, webhook endpoints, and dispatch your first verified OTP.
        </CardDescription>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 pt-0 space-y-3'>
        <ul className='space-y-2 text-xs text-muted-foreground'>
          <li className='flex items-center gap-2'>
            <span className='size-1.5 rounded-full bg-primary' />
            <span>Generate your admin API secret key</span>
          </li>
          <li className='flex items-center gap-2'>
            <span className='size-1.5 rounded-full bg-primary' />
            <span>Link Meta WhatsApp Business credentials</span>
          </li>
          <li className='flex items-center gap-2'>
            <span className='size-1.5 rounded-full bg-primary' />
            <span>Test live delivery in OTP Sandbox</span>
          </li>
        </ul>
      </CardContent>
      <CardFooter className='p-4 sm:p-6 pt-0 border-t bg-muted/10'>
        <Link
          href='/dashboard/onboarding'
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full text-xs font-medium')}
        >
          <span>Open Setup Checklist</span>
          <Icons.arrowRight className='size-3.5 ml-1.5' />
        </Link>
      </CardFooter>
    </Card>
  );
}

function CodeSnippet({ code }: { code: string }) {
  return (
    <div className='overflow-hidden rounded-lg border bg-muted/40 text-xs sm:text-[13px]'>
      <div className='flex items-center justify-end border-b bg-muted/70 px-3 py-1 text-xs text-muted-foreground'>
        <CopyButton value={code} className='h-6 px-2 text-[11px]'>
          <span className='ml-1 text-[11px]'>Copy</span>
        </CopyButton>
      </div>
      <pre className='max-h-60 overflow-x-auto p-3 font-mono leading-relaxed'>{code}</pre>
    </div>
  );
}

function QuickStartCard() {
  const [lang, setLang] = React.useState<'curl' | 'node' | 'python'>('curl');

  const curlSteps = [
    {
      title: '1. Create an API Key',
      body: 'Generate a secret key from the dashboard or via API:',
      code: `curl -X POST "${API_URL}/v1/keys" \\\n  -H "Authorization: Bearer $DASHBOARD_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"label": "production"}'`
    },
    {
      title: '2. Send an OTP',
      body: 'Call send with your secret key in the X-Api-Key header:',
      code: `curl -X POST "${API_URL}/v1/otp/send" \\\n  -H "X-Api-Key: $WAOTP_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"to": "919876543210", "channel": "whatsapp"}'`
    },
    {
      title: '3. Verify the OTP',
      body: 'Validate the code entered by the user. Codes burn upon verification:',
      code: `curl -X POST "${API_URL}/v1/otp/verify" \\\n  -H "X-Api-Key: $WAOTP_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"to": "919876543210", "code": "123456"}'`
    }
  ];

  const nodeSteps = [
    {
      title: '1. Dispatch OTP (Node / TypeScript)',
      body: 'Send an OTP to recipient using native fetch:',
      code: `const res = await fetch('${API_URL}/v1/otp/send', {\n  method: 'POST',\n  headers: {\n    'X-Api-Key': process.env.WAOTP_KEY,\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify({\n    to: '919876543210',\n    channel: 'whatsapp' // or 'telegram'\n  })\n});\nconst data = await res.json();\nconsole.log(data); // { ok: true, expires_in: 300 }`
    },
    {
      title: '2. Verify Code (Node / TypeScript)',
      body: 'Verify what the user typed against the gateway:',
      code: `const res = await fetch('${API_URL}/v1/otp/verify', {\n  method: 'POST',\n  headers: {\n    'X-Api-Key': process.env.WAOTP_KEY,\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify({\n    to: '919876543210',\n    code: userInputCode\n  })\n});\nconst result = await res.json();\nif (result.verified) {\n  console.log('User verified successfully!');\n}`
    }
  ];

  const pythonSteps = [
    {
      title: '1. Dispatch OTP (Python)',
      body: 'Send an OTP to recipient using requests:',
      code: `import requests\n\nresp = requests.post(\n    "${API_URL}/v1/otp/send",\n    headers={"X-Api-Key": os.environ["WAOTP_KEY"]},\n    json={"to": "919876543210", "channel": "whatsapp"}\n)\ndata = resp.json()\nprint(data)  # {"ok": True, "expires_in": 300}`
    },
    {
      title: '2. Verify Code (Python)',
      body: 'Verify received OTP code:',
      code: `import requests\n\nresp = requests.post(\n    "${API_URL}/v1/otp/verify",\n    headers={"X-Api-Key": os.environ["WAOTP_KEY"]},\n    json={"to": "919876543210", "code": user_code}\n)\nresult = resp.json()\nif result.get("verified"):\n    print("User authenticated successfully!")`
    }
  ];

  const steps = lang === 'curl' ? curlSteps : lang === 'node' ? nodeSteps : pythonSteps;

  return (
    <Card className='border shadow-sm'>
      <CardHeader className='p-4 sm:p-6 pb-3 sm:pb-4 border-b bg-muted/20'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <CardTitle className='text-base sm:text-lg flex items-center gap-2'>
              <Icons.code className='size-4 text-primary' />
              Integration Quick Start
            </CardTitle>
            <CardDescription className='text-xs sm:text-sm mt-0.5'>
              Implement phone authentication into your backend in two API calls.
            </CardDescription>
          </div>
          <div className='flex rounded-lg border bg-muted p-0.5 text-xs'>
            <button
              type='button'
              onClick={() => setLang('curl')}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition-all',
                lang === 'curl'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              cURL
            </button>
            <button
              type='button'
              onClick={() => setLang('node')}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition-all',
                lang === 'node'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Node.js / TS
            </button>
            <button
              type='button'
              onClick={() => setLang('python')}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition-all',
                lang === 'python'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Python
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 space-y-5'>
        {steps.map((s) => (
          <div key={s.title} className='space-y-1.5'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold text-xs sm:text-sm text-foreground'>{s.title}</span>
            </div>
            <p className='text-muted-foreground text-xs'>{s.body}</p>
            <CodeSnippet code={s.code} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentKeysCard() {
  const { data, isLoading } = useQuery({ queryKey: ['keys'], queryFn: listKeys });

  return (
    <Card className='border shadow-sm flex flex-col justify-between'>
      <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3 border-b bg-muted/20'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-base font-semibold flex items-center gap-2'>
            <Icons.key className='size-4 text-primary' />
            Recent API Keys
          </CardTitle>
          <Link
            href='/dashboard/keys'
            className='inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline'
          >
            <span>Manage</span>
            <Icons.arrowRight className='size-3' />
          </Link>
        </div>
        <CardDescription className='text-xs'>
          Your active secret keys used for API authentication
        </CardDescription>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 flex-1'>
        {isLoading ? (
          <div className='space-y-2.5'>
            <Skeleton className='h-10 w-full rounded-md' />
            <Skeleton className='h-10 w-full rounded-md' />
          </div>
        ) : !data || data.keys.length === 0 ? (
          <div className='py-8 text-center text-xs sm:text-sm text-muted-foreground'>
            <Icons.key className='mx-auto size-6 mb-2 text-muted-foreground/50' />
            No API keys created yet.{' '}
            <Link href='/dashboard/keys' className='text-primary underline underline-offset-4 font-medium'>
              Create your first key
            </Link>
          </div>
        ) : (
          <ul className='divide-y'>
            {data.keys.slice(0, 4).map((k) => (
              <li key={k.id} className='flex items-center justify-between py-2.5 first:pt-0 last:pb-0 gap-2'>
                <div className='min-w-0'>
                  <p className='text-xs sm:text-sm font-medium truncate'>{k.label || 'Unnamed key'}</p>
                  <p className='text-muted-foreground font-mono text-[11px]'>waotp_••••{k.last4}</p>
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                  <Badge variant={k.active ? 'secondary' : 'outline'} className='text-[10px]'>
                    {k.active ? 'active' : 'inactive'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter className='p-4 sm:p-6 pt-0 border-t bg-muted/10'>
        <Link
          href='/dashboard/keys'
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full text-xs font-medium')}
        >
          <Icons.add className='size-3.5 mr-1.5' />
          Create new key
        </Link>
      </CardFooter>
    </Card>
  );
}

function TempMailTipCard() {
  // Nothing to show unless this installation opted in — see lib/temp-mail.ts.
  if (!TEMP_MAIL_ENABLED) return null;

  return (
    <Card className='border border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-sky-500/[0.03] to-transparent shadow-sm'>
      <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-sm font-semibold flex items-center gap-2 text-foreground'>
            <span className='flex size-6 items-center justify-center rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400'>
              <Icons.mail className='size-3.5' />
            </span>
            Testing with Temp Mail
          </CardTitle>
          <Badge variant='outline' className='border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px]'>
            Companion Tool
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 pt-0 space-y-2.5'>
        <p className='text-xs text-muted-foreground leading-relaxed'>
          Testing your application&apos;s registration and authentication flows? Use disposable inboxes on{' '}
          <strong className='text-foreground font-medium'>{tempMailHost()}</strong> to test without sharing your real email address.
        </p>
        <div>
          <a
            href={TEMP_MAIL_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline'
          >
            <span>Open Temp Mail</span>
            <Icons.externalLink className='size-3' />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export function Overview() {
  return (
    <div className='flex flex-col gap-6'>
      {/* Quick Action Bar */}
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3 sm:p-4'>
        <div className='flex items-center gap-2'>
          <span className='size-2.5 rounded-full bg-emerald-500 animate-pulse' />
          <span className='text-xs sm:text-sm font-semibold text-foreground'>
            Self-Hosted Gateway: Operational
          </span>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Link
            href='/dashboard/tester'
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 text-xs')}
          >
            <Icons.flask className='size-3.5 mr-1.5 text-primary' />
            Test on Phone
          </Link>
          <Link
            href='/dashboard/keys'
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 text-xs')}
          >
            <Icons.add className='size-3.5 mr-1.5 text-primary' />
            New API Key
          </Link>
          <Link
            href='/dashboard/onboarding'
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 text-xs')}
          >
            <Icons.check className='size-3.5 mr-1.5 text-primary' />
            Setup Checklist
          </Link>
          <Link
            href='/docs'
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 text-xs')}
          >
            <Icons.book className='size-3.5 mr-1.5' />
            API Docs
          </Link>
        </div>
      </div>

      {/* Top 4 Metrics / Channel Cards */}
      <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'>
        <UsageCard />
        <TelegramChannelCard />
        <KeysCountCard />
        <SandboxPromoCard />
      </div>

      {/* Middle: Installation Status & First-Run Checklist */}
      <div className='grid gap-6 grid-cols-1 lg:grid-cols-12 items-start'>
        <div className='lg:col-span-8'>
          <InstallationStatusCard />
        </div>
        <div className='lg:col-span-4'>
          <FirstRunChecklistCard />
        </div>
      </div>

      {/* Bottom: Quick Start & Recent Keys */}
      <div className='grid gap-6 grid-cols-1 lg:grid-cols-12 items-start'>
        <div className='lg:col-span-8'>
          <QuickStartCard />
        </div>
        <div className='lg:col-span-4 flex flex-col gap-6'>
          <RecentKeysCard />
          <TempMailTipCard />
        </div>
      </div>
    </div>
  );
}
