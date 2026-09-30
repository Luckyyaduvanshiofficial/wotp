'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAppForm } from '@/lib/form';
import { pbUsers, appOrigin } from '@/lib/pb';
import { SubmitButton } from '@/components/forms/submit-button';
import { z } from 'zod';

const forgotSchema = z.object({
  email: z.email('Enter a valid email address')
});

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);

  const form = useAppForm({
    defaultValues: { email: '' },
    validators: { onSubmit: forgotSchema },
    onSubmit: async ({ value }) => {
      try {
        // Always report success — never reveal whether the email exists.
        //
        // `redirectTo` is sent as a *query* parameter (the SDK folds any unknown
        // top-level option into the query string — see SendOptions in the SDK
        // types), asking PocketBase to point the emailed link at our own
        // /reset-password route instead of the hosted
        // `/_/#/auth/confirm-password-reset/...` page on your PocketBase host.
        //
        // UNVERIFIED: PocketBase may ignore an unknown query param, in which
        // case the email still lands on its hosted page and the link must be
        // set in the collection's password-reset email template instead
        // (`{APP_URL}/reset-password?token={TOKEN}`). Harmless either way.
        const origin = appOrigin();
        await pbUsers().requestPasswordReset(
          value.email,
          origin ? { redirectTo: `${origin}/reset-password` } : undefined
        );
      } catch {
        // swallow; same UX either way
      }
      setSent(true);
    }
  });

  if (sent) {
    return (
      <div className='grid gap-3 text-center'>
        <p className='text-sm'>
          If an account exists for <span className='font-medium'>{form.state.values.email}</span>, a
          reset link is on its way. Check your inbox (and spam).
        </p>
        <Link
          href='/login'
          className='text-muted-foreground hover:text-primary text-sm underline-offset-4 hover:underline'
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form.AppForm>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className='grid gap-4'
      >
        <form.AppField
          name='email'
          children={(field) => (
            <field.TextField
              label='Email'
              type='email'
              placeholder='you@example.com'
              description="We'll send you a reset link."
              required
            />
          )}
        />
        <SubmitButton>Send reset link</SubmitButton>
      </form>
    </form.AppForm>
  );
}
