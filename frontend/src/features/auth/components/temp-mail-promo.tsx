import * as React from 'react';
import { Icons } from '@/components/icons';
import { TEMP_MAIL_ENABLED, TEMP_MAIL_URL, tempMailHost } from '@/lib/temp-mail';

/**
 * Renders nothing unless NEXT_PUBLIC_TEMP_MAIL_URL is configured — see
 * lib/temp-mail.ts for why the project ships no default.
 */
export function TempMailPromo() {
  if (!TEMP_MAIL_ENABLED) return null;

  return (
    <div className='relative overflow-hidden rounded-xl border border-sky-500/25 bg-sky-500/[0.04] p-3 sm:p-3.5 transition-colors hover:border-sky-500/40'>
      <div className='flex items-start gap-3'>
        <div className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400'>
          <Icons.mail className='size-4' />
        </div>
        <div className='flex-1 min-w-0'>
          <div className='flex flex-wrap items-center justify-between gap-1'>
            <span className='text-xs font-semibold text-foreground'>
              Test with Temp Mail
            </span>
            <span className='rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sky-600 dark:text-sky-400'>
              Instant &amp; Free
            </span>
          </div>
          <p className='mt-1 text-[11.5px] leading-relaxed text-muted-foreground'>
            Testing this dashboard? Use a free disposable inbox on Temp Mail to test without using your real email.
          </p>
          <div className='mt-2'>
            <a
              href={TEMP_MAIL_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:text-sky-500 underline underline-offset-4'
            >
              <span>Get temporary email at {tempMailHost()}</span>
              <Icons.externalLink className='size-3' />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
