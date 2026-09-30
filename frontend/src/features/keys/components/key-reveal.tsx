'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
import { Icons } from '@/components/icons';

/**
 * Unmissable one-time reveal of a freshly created plaintext API key.
 * Shown exactly once — after dismissal the plaintext is gone from the UI. The
 * in-memory handoff to the tester page (lib/key-handoff.ts) is consumed on the
 * next navigation and is never written to storage.
 */
export function KeyReveal({
  apiKey,
  last4,
  label,
  onDone
}: {
  apiKey: string;
  last4: string;
  label: string;
  onDone: () => void;
}) {
  return (
    <div className='border-amber-500/50 bg-amber-500/5 space-y-4 rounded-lg border p-5'>
      <div className='flex items-start gap-3'>
        <Icons.warning className='mt-0.5 size-5 shrink-0 text-amber-500' />
        <div>
          <p className='font-semibold'>
            Copy your new key {label && <span className='font-normal'>&ldquo;{label}&rdquo;</span>}
          </p>
          <p className='text-muted-foreground text-sm'>
            This is the <strong>only time</strong> the full key is shown. It will not be displayed
            again — store it somewhere safe now.
          </p>
        </div>
      </div>

      <div className='bg-background flex items-center gap-2 rounded-lg border p-3'>
        <code className='min-w-0 flex-1 truncate font-mono text-sm select-all'>{apiKey}</code>
        <CopyButton value={apiKey}>Copy key</CopyButton>
      </div>

      <div className='flex items-center justify-between'>
        <p className='text-muted-foreground text-xs'>
          Future reference: <span className='font-mono'>wotp_••••{last4}</span>
        </p>
        <button
          type='button'
          onClick={onDone}
          className='text-primary text-sm font-medium underline-offset-4 hover:underline'
        >
          I&apos;ve saved it — dismiss
        </button>
      </div>
    </div>
  );
}

export function copiedKeyToast(last4: string) {
  toast.success(`Key ••••${last4} copied`);
}
