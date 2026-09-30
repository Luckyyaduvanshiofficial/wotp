'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  sendOtp,
  verifyOtp,
  createKey,
  isApiError,
  errorMessage,
  API_URL,
  type SendOtpResult,
  type VerifyOtpResult
} from '@/lib/api';
import { takePlaintextKey } from '@/lib/key-handoff';
import { CopyButton } from '@/components/copy-button';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingButton } from '@/components/ui/loading-button';
import { cn } from '@/lib/utils';

function cleanAndNormalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  return digits;
}

function JsonBlock({
  data,
  label = 'Response Payload',
  isError = false
}: {
  data: unknown;
  label?: string;
  isError?: boolean;
}) {
  const text = JSON.stringify(data, null, 2);
  return (
    <div className='overflow-hidden rounded-lg border bg-muted/40 text-xs sm:text-[13px]'>
      <div className='flex items-center justify-between border-b bg-muted/70 px-3 py-1.5 text-xs'>
        <span
          className={cn('font-mono font-medium', isError ? 'text-destructive' : 'text-foreground')}
        >
          {label}
        </span>
        <CopyButton value={text} className='h-6 px-2 text-[11px]'>
          <span className='ml-1 text-[11px]'>Copy JSON</span>
        </CopyButton>
      </div>
      <pre className='max-h-60 sm:max-h-72 overflow-auto p-3 font-mono leading-relaxed'>{text}</pre>
    </div>
  );
}

export function TesterView() {
  // Send form state
  const [apiKey, setApiKey] = React.useState('');
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [channel, setChannel] = React.useState<'whatsapp' | 'telegram'>('whatsapp');
  const [customCode, setCustomCode] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [generatingKey, setGeneratingKey] = React.useState(false);
  const [sendResult, setSendResult] = React.useState<SendOtpResult | null>(null);
  const [sendError, setSendError] = React.useState<Record<string, unknown> | null>(null);
  const [telegramLinkUrl, setTelegramLinkUrl] = React.useState<string | null>(null);

  // Verify form state
  const [verifyPhone, setVerifyPhone] = React.useState('');
  const [verifyCode, setVerifyCode] = React.useState('');
  const [verifying, setVerifying] = React.useState(false);
  const [verifyResult, setVerifyResult] = React.useState<VerifyOtpResult | null>(null);
  const [verifyError, setVerifyError] = React.useState<Record<string, unknown> | null>(null);

  // cURL preview tab state
  const [curlTab, setCurlTab] = React.useState<'send' | 'verify'>('send');

  // The key is never persisted. It arrives from the keys page as an in-memory
  // handoff (lib/key-handoff.ts) and lives in this component's state until the
  // tab is closed or the user clears it.
  React.useEffect(() => {
    const handoff = takePlaintextKey();
    if (handoff?.api_key) setApiKey(handoff.api_key);
  }, []);

  function handleApiKeyChange(val: string) {
    setApiKey(val);
  }

  function handleClearApiKey() {
    setApiKey('');
    toast.info('API key cleared from this tab');
  }

  async function handleQuickGenerateKey() {
    setGeneratingKey(true);
    try {
      const created = await createKey('Tester Quick Key');
      setApiKey(created.api_key);
      toast.success('New API key generated and loaded!');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setGeneratingKey(false);
    }
  }

  const codeInvalid = customCode !== '' && !/^[A-Za-z0-9]{4,10}$/.test(customCode);

  async function handleSend() {
    const key = apiKey.trim();
    if (!key) {
      toast.error('API key is required. Paste one or click "Generate test key".');
      return;
    }

    const normalized = cleanAndNormalizePhone(phone);
    if (!normalized || normalized.length < 10 || normalized.length > 15) {
      toast.error('Enter a valid phone number (e.g. 919876543210 or 9876543210).');
      return;
    }

    if (codeInvalid) {
      toast.error('Custom code must be 4–10 letters/numbers.');
      return;
    }

    setSending(true);
    setSendResult(null);
    setSendError(null);
    setTelegramLinkUrl(null);

    try {
      const result = await sendOtp(key, {
        to: normalized,
        channel,
        ...(customCode.trim() ? { code: customCode.trim() } : {})
      });
      setSendResult(result);
      setVerifyPhone(normalized);
      if (customCode.trim()) setVerifyCode(customCode.trim());
      toast.success(`OTP dispatched on ${channel}`);
    } catch (e: unknown) {
      if (isApiError(e)) {
        setSendError({
          ok: false,
          error: e.code,
          ...e.extra
        });
        if (e.code === 'user_not_linked' && e.extra.link_url) {
          setTelegramLinkUrl(String(e.extra.link_url));
          toast.error('Telegram bot linking required. Click the link button below!');
        } else {
          toast.error(errorMessage(e));
        }
      } else {
        setSendError({
          ok: false,
          error: e instanceof Error ? e.message : 'Unknown error'
        });
        toast.error('Failed to send OTP.');
      }
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    const key = apiKey.trim();
    if (!key) {
      toast.error('API key is required to verify OTP. Please paste or generate one above.');
      return;
    }

    const normalized = cleanAndNormalizePhone(verifyPhone);
    if (!normalized || !verifyCode.trim()) {
      toast.error('Enter the phone and the verification code.');
      return;
    }

    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);

    try {
      const result = await verifyOtp(key, {
        to: normalized,
        code: verifyCode.trim()
      });
      setVerifyResult(result);
      if (result.verified) {
        toast.success('Code verified successfully ✓');
      } else {
        const left = result.attempts_left;
        toast.error(`Wrong code${left !== undefined ? ` — ${left} attempt(s) left` : ''}`);
      }
    } catch (e: unknown) {
      if (isApiError(e)) {
        setVerifyError({
          ok: false,
          error: e.code,
          ...e.extra
        });
        if (e.code === 'wrong_code') {
          const left = e.extra.attempts_left;
          toast.error(`Wrong code${left !== undefined ? ` — ${left} attempt(s) left` : ''}`);
        } else if (e.code === 'code_expired') {
          toast.error('Code expired or already used. Please request a new code.');
        } else {
          toast.error(errorMessage(e));
        }
      } else {
        setVerifyError({
          ok: false,
          error: e instanceof Error ? e.message : 'Verification failed'
        });
        toast.error('Verification failed.');
      }
    } finally {
      setVerifying(false);
    }
  }

  // Generate dynamic curl command snippet
  const effectiveKey = apiKey.trim() || '$WAOTP_KEY';
  const effectivePhone = cleanAndNormalizePhone(phone) || '919876543210';
  const effectiveVerifyPhone = cleanAndNormalizePhone(verifyPhone) || '919876543210';
  const effectiveCode = verifyCode.trim() || '123456';

  const sendCurl = `curl -X POST "${API_URL}/v1/otp/send" \\
  -H "X-Api-Key: ${effectiveKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      to: effectivePhone,
      channel,
      ...(customCode.trim() ? { code: customCode.trim() } : {})
    },
    null,
    2
  )}'`;

  const verifyCurl = `curl -X POST "${API_URL}/v1/otp/verify" \\
  -H "X-Api-Key: ${effectiveKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      to: effectiveVerifyPhone,
      code: effectiveCode
    },
    null,
    2
  )}'`;

  return (
    <div className='flex flex-col gap-6'>
      {/* Top Channel & Info Alert */}
      <Alert className='border-primary/20 bg-primary/5'>
        <Icons.info className='size-4 text-primary shrink-0' />
        <AlertTitle className='font-medium text-primary'>Interactive OTP Sandbox</AlertTitle>
        <AlertDescription className='text-muted-foreground mt-1 text-xs sm:text-sm leading-relaxed'>
          Test live dispatch and verification on your own mobile device.
          <span className='inline-block sm:inline ml-0 sm:ml-1 font-medium text-foreground'>
            Telegram
          </span>{' '}
          is 100% free and unmetered with instant bot delivery.
          <span className='inline-block sm:inline ml-0 sm:ml-1 font-medium text-foreground'>
            WhatsApp
          </span>{' '}
          delivers template messages via your configured Meta Cloud API credentials or mock mode.
        </AlertDescription>
      </Alert>

      {/* API Key Configuration Card */}
      <Card className='border shadow-sm'>
        <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <CardTitle className='flex items-center gap-2 text-base sm:text-lg'>
              <Icons.key className='size-4 text-primary' />
              API Authentication
            </CardTitle>
            {apiKey.trim() ? (
              <Badge
                variant='outline'
                className='border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1.5'
              >
                <span className='size-1.5 rounded-full bg-emerald-500' />
                Key Ready
              </Badge>
            ) : (
              <Badge
                variant='outline'
                className='border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1.5'
              >
                <span className='size-1.5 rounded-full bg-amber-500' />
                API Key Required
              </Badge>
            )}
          </div>
          <CardDescription className='text-xs sm:text-sm'>
            Your secret API key authenticates both Send and Verify requests. It is held in this
            tab&apos;s memory only — never written to browser storage — so reloading the page clears
            it.
          </CardDescription>
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-0 sm:pt-0'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
            <div className='relative flex-1'>
              <Input
                id='tester-key'
                type={showApiKey ? 'text' : 'password'}
                placeholder='waotp_… (paste your key or click Generate)'
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                autoComplete='off'
                className='pr-10 font-mono text-xs sm:text-sm min-h-[42px]'
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                className='text-muted-foreground hover:text-foreground absolute right-1 top-1/2 -translate-y-1/2 size-8'
                onClick={() => setShowApiKey((prev) => !prev)}
              >
                {showApiKey ? (
                  <Icons.eyeOff className='size-4' />
                ) : (
                  <Icons.eye className='size-4' />
                )}
              </Button>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                className='h-[42px] px-3 text-xs sm:text-sm font-medium flex-1 sm:flex-initial'
                onClick={() => void handleQuickGenerateKey()}
                disabled={generatingKey}
              >
                {generatingKey ? (
                  <Icons.spinner className='mr-1.5 size-3.5 animate-spin' />
                ) : (
                  <Icons.add className='mr-1.5 size-3.5 text-primary' />
                )}
                {generatingKey ? 'Generating…' : 'Generate Key'}
              </Button>
              {apiKey.trim() && (
                <>
                  <CopyButton value={apiKey.trim()} className='h-[42px] px-3 text-xs sm:text-sm'>
                    <span className='ml-1.5 hidden xs:inline'>Copy</span>
                  </CopyButton>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-muted-foreground hover:text-destructive h-[42px] px-2.5 text-xs'
                    onClick={handleClearApiKey}
                    title='Clear the key from this tab'
                  >
                    <Icons.trash className='size-3.5' />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Responsive Main Layout: 2 Columns on Desktop, 1 Column on Mobile/Tablet */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 items-start'>
        {/* ============================================================ */}
        {/* STEP 1: SEND AN OTP CARD                                     */}
        {/* ============================================================ */}
        <Card className='border shadow-sm flex flex-col h-full'>
          <CardHeader className='p-4 sm:p-6 pb-3 sm:pb-4 border-b bg-muted/20'>
            <div className='flex items-center justify-between gap-2'>
              <CardTitle className='flex items-center gap-2 text-base sm:text-lg'>
                <span className='flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold'>
                  1
                </span>
                Send an OTP
              </CardTitle>
              <Badge variant='secondary' className='text-xs font-normal'>
                Step 1
              </Badge>
            </div>
            <CardDescription className='text-xs sm:text-sm'>
              Dispatch an OTP code to your recipient via WhatsApp or Telegram.
            </CardDescription>
          </CardHeader>

          <CardContent className='p-4 sm:p-6 grid gap-5 flex-1'>
            {/* Channel Toggle Buttons */}
            <div className='grid gap-2'>
              <Label className='text-xs sm:text-sm font-medium'>Delivery Channel</Label>
              <div className='grid grid-cols-2 gap-2.5'>
                <button
                  type='button'
                  onClick={() => setChannel('whatsapp')}
                  className={cn(
                    'flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 rounded-lg border p-3 text-xs sm:text-sm font-medium transition-all text-center',
                    channel === 'whatsapp'
                      ? 'border-emerald-500 bg-emerald-500/10 text-foreground font-semibold shadow-xs'
                      : 'border-input hover:bg-accent text-muted-foreground'
                  )}
                >
                  <Icons.whatsapp
                    className={cn(
                      'size-4 sm:size-5 shrink-0',
                      channel === 'whatsapp' ? 'text-emerald-500' : 'text-muted-foreground'
                    )}
                  />
                  <span>WhatsApp</span>
                  {channel === 'whatsapp' && (
                    <span className='hidden xs:inline text-[11px] font-normal text-muted-foreground'>
                      (Meta Cloud)
                    </span>
                  )}
                </button>

                <button
                  type='button'
                  onClick={() => setChannel('telegram')}
                  className={cn(
                    'flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 rounded-lg border p-3 text-xs sm:text-sm font-medium transition-all text-center',
                    channel === 'telegram'
                      ? 'border-sky-500 bg-sky-500/10 text-foreground font-semibold shadow-xs'
                      : 'border-input hover:bg-accent text-muted-foreground'
                  )}
                >
                  <Icons.telegram
                    className={cn(
                      'size-4 sm:size-5 shrink-0',
                      channel === 'telegram' ? 'text-sky-500' : 'text-muted-foreground'
                    )}
                  />
                  <span>Telegram</span>
                  <span className='hidden xs:inline text-[11px] font-normal text-sky-600 dark:text-sky-400'>
                    (Free)
                  </span>
                </button>
              </div>
              <p className='text-muted-foreground text-[11px] sm:text-xs'>
                {channel === 'telegram'
                  ? 'Telegram OTP is free, instant, and unmetered with no business verification needed.'
                  : 'WhatsApp OTP uses your own Meta Cloud API credentials or mock mode.'}
              </p>
            </div>

            {/* Recipient Phone */}
            <div className='grid gap-2'>
              <Label
                htmlFor='tester-phone'
                className='text-xs sm:text-sm font-medium flex items-center gap-1.5'
              >
                <Icons.phone className='size-3.5 text-muted-foreground' />
                Recipient Phone
              </Label>
              <Input
                id='tester-phone'
                inputMode='tel'
                type='tel'
                placeholder='919876543210 or 9876543210'
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className='font-mono text-xs sm:text-sm min-h-[42px]'
              />
              <p className='text-muted-foreground text-[11px] sm:text-xs'>
                10-digit Indian numbers auto-prefix country code <strong>91</strong>.
              </p>
            </div>

            {/* Custom OTP Code (Optional) */}
            <div className='grid gap-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='tester-code' className='text-xs sm:text-sm font-medium'>
                  Custom Code <span className='text-muted-foreground font-normal'>(optional)</span>
                </Label>
                <span className='text-muted-foreground text-[11px]'>Default: auto 6-digit</span>
              </div>
              <Input
                id='tester-code'
                placeholder='e.g. 424242 or SECURE9'
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                aria-invalid={codeInvalid || undefined}
                className='font-mono text-xs sm:text-sm min-h-[42px]'
              />
              {codeInvalid ? (
                <p className='text-destructive text-[11px] sm:text-xs'>
                  Must be 4–10 alphanumeric characters.
                </p>
              ) : (
                <p className='text-muted-foreground text-[11px] sm:text-xs'>
                  Leave blank to auto-generate a random 6-digit secure code.
                </p>
              )}
            </div>

            {/* Send Button */}
            <div>
              <LoadingButton
                loading={sending}
                disabled={sending}
                onClick={() => void handleSend()}
                className='w-full sm:w-auto min-h-[42px] px-6 text-xs sm:text-sm font-medium'
              >
                <Icons.send className='mr-2 size-4' />
                Send OTP
              </LoadingButton>
            </div>

            {/* Telegram Link Required Alert */}
            {telegramLinkUrl && (
              <Alert className='border-amber-500/30 bg-amber-500/10'>
                <Icons.warning className='size-4 text-amber-500 shrink-0' />
                <AlertTitle className='font-semibold text-amber-600 dark:text-amber-400 text-xs sm:text-sm'>
                  Telegram Bot Link Required
                </AlertTitle>
                <AlertDescription className='mt-2 flex flex-col gap-3 text-xs sm:text-sm'>
                  <span>
                    This phone number is not linked to your Telegram account yet. Click below to
                    open the Telegram bot and pair your number with 1 click:
                  </span>
                  <a
                    href={telegramLinkUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex w-full sm:w-fit items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2.5 font-medium text-white hover:bg-sky-500 shadow-sm transition-colors'
                  >
                    <Icons.telegram className='size-4' />
                    Open Telegram Bot & Link Number
                  </a>
                </AlertDescription>
              </Alert>
            )}

            {/* Send Success Result */}
            {sendResult && (
              <div className='grid gap-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5'>
                    <Icons.circleCheck className='size-3.5' />
                    Dispatched Successfully
                  </span>
                  <span className='text-muted-foreground text-[11px]'>
                    Expires in {sendResult.expires_in ?? '?'}s
                  </span>
                </div>
                <JsonBlock data={sendResult} label='Send Response (200 OK)' />
              </div>
            )}

            {/* Send Error Result */}
            {sendError && (
              <div className='grid gap-2'>
                <span className='text-destructive text-xs font-semibold flex items-center gap-1.5'>
                  <Icons.alertCircle className='size-3.5' />
                  Dispatch Failed
                </span>
                <JsonBlock data={sendError} label='Error Payload' isError />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============================================================ */}
        {/* STEP 2: VERIFY AN OTP CARD                                   */}
        {/* ============================================================ */}
        <Card className='border shadow-sm flex flex-col h-full'>
          <CardHeader className='p-4 sm:p-6 pb-3 sm:pb-4 border-b bg-muted/20'>
            <div className='flex items-center justify-between gap-2'>
              <CardTitle className='flex items-center gap-2 text-base sm:text-lg'>
                <span className='flex size-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold'>
                  2
                </span>
                Verify an OTP
              </CardTitle>
              <Badge variant='secondary' className='text-xs font-normal'>
                Step 2
              </Badge>
            </div>
            <CardDescription className='text-xs sm:text-sm'>
              Validate the code entered by the user. Codes are single-use and burn after
              verification.
            </CardDescription>
          </CardHeader>

          <CardContent className='p-4 sm:p-6 grid gap-5 flex-1'>
            {/* Auto-filled notification banner if send succeeded */}
            {sendResult && (
              <div className='flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs sm:text-sm text-primary'>
                <Icons.sparkles className='size-4 shrink-0' />
                <span>
                  OTP dispatched to <strong>{verifyPhone}</strong>! Enter the received code below to
                  verify.
                </span>
              </div>
            )}

            {/* Verify Phone */}
            <div className='grid gap-2'>
              <Label
                htmlFor='verify-phone'
                className='text-xs sm:text-sm font-medium flex items-center gap-1.5'
              >
                <Icons.phone className='size-3.5 text-muted-foreground' />
                Phone Number
              </Label>
              <Input
                id='verify-phone'
                inputMode='tel'
                type='tel'
                placeholder='919876543210'
                value={verifyPhone}
                onChange={(e) => setVerifyPhone(e.target.value)}
                className='font-mono text-xs sm:text-sm min-h-[42px]'
              />
            </div>

            {/* Verify Code */}
            <div className='grid gap-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='verify-code' className='text-xs sm:text-sm font-medium'>
                  Verification Code
                </Label>
                {customCode.trim() && customCode.trim() !== verifyCode && (
                  <button
                    type='button'
                    onClick={() => setVerifyCode(customCode.trim())}
                    className='text-primary hover:underline text-[11px] font-medium'
                  >
                    Use sent code ({customCode.trim()})
                  </button>
                )}
              </div>
              <Input
                id='verify-code'
                placeholder='e.g. 123456'
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className='font-mono text-sm sm:text-base tracking-wider min-h-[42px]'
              />
              <p className='text-muted-foreground text-[11px] sm:text-xs'>
                Codes expire after validity duration or maximum guess attempts.
              </p>
            </div>

            {/* Verify Button */}
            <div>
              <LoadingButton
                loading={verifying}
                disabled={verifying}
                onClick={() => void handleVerify()}
                className='w-full sm:w-auto min-h-[42px] px-6 text-xs sm:text-sm font-medium'
              >
                <Icons.check className='mr-2 size-4' />
                Verify Code
              </LoadingButton>
            </div>

            {/* Verification Success Highlight */}
            {verifyResult?.verified && (
              <div className='flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-emerald-700 dark:text-emerald-300'>
                <Icons.circleCheck className='size-5 shrink-0 text-emerald-600 dark:text-emerald-400' />
                <div className='text-xs sm:text-sm'>
                  <p className='font-semibold'>Verification Succeeded ✓</p>
                  <p className='text-[11px] sm:text-xs text-emerald-600/90 dark:text-emerald-400/90'>
                    The OTP code has been verified and consumed.
                  </p>
                </div>
              </div>
            )}

            {/* Verify Response Block */}
            {verifyResult && (
              <div className='grid gap-2'>
                <span className='text-xs font-medium'>Verification Response</span>
                <JsonBlock data={verifyResult} label='Verify Response (200 OK)' />
              </div>
            )}

            {/* Verify Error Block */}
            {verifyError && (
              <div className='grid gap-2'>
                <span className='text-destructive text-xs font-semibold flex items-center gap-1.5'>
                  <Icons.alertCircle className='size-3.5' />
                  Verification Failed
                </span>
                <JsonBlock data={verifyError} label='Error Response' isError />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============================================================ */}
      {/* DEVELOPER QUICK CURL & REQUEST INSPECTOR                     */}
      {/* ============================================================ */}
      <Card className='border shadow-sm'>
        <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <CardTitle className='flex items-center gap-2 text-sm sm:text-base'>
              <Icons.code className='size-4 text-primary' />
              Backend Integration Snippet
            </CardTitle>
            <div className='flex rounded-lg border bg-muted p-0.5 text-xs'>
              <button
                type='button'
                onClick={() => setCurlTab('send')}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-all',
                  curlTab === 'send'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Send cURL
              </button>
              <button
                type='button'
                onClick={() => setCurlTab('verify')}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-all',
                  curlTab === 'verify'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Verify cURL
              </button>
            </div>
          </div>
          <CardDescription className='text-xs sm:text-sm'>
            Copy the exact terminal command corresponding to the values entered in the form above.
          </CardDescription>
        </CardHeader>
        <CardContent className='p-4 sm:p-6 pt-0 sm:pt-0'>
          <div className='overflow-hidden rounded-lg border bg-muted/40 text-xs sm:text-[13px]'>
            <div className='flex items-center justify-between border-b bg-muted/70 px-3 py-1.5 text-xs text-muted-foreground'>
              <span className='font-mono font-medium text-foreground'>
                {curlTab === 'send' ? 'POST /v1/otp/send' : 'POST /v1/otp/verify'}
              </span>
              <CopyButton
                value={curlTab === 'send' ? sendCurl : verifyCurl}
                className='h-6 px-2 text-[11px]'
              >
                <span className='ml-1 text-[11px]'>Copy Command</span>
              </CopyButton>
            </div>
            <pre className='overflow-x-auto p-3 font-mono leading-relaxed'>
              {curlTab === 'send' ? sendCurl : verifyCurl}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* API Documentation Link */}
      <div className='flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs sm:text-sm py-1'>
        <p className='flex items-center gap-1.5'>
          <Icons.book className='size-3.5 text-primary' />
          Looking for full request headers, schemas, and status codes?
        </p>
        <Link
          href='/docs'
          className='inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4 hover:opacity-80'
        >
          <span>Explore API Documentation</span>
          <Icons.arrowRight className='size-3.5' />
        </Link>
      </div>
    </div>
  );
}
