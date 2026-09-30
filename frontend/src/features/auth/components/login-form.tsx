'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { pbUsers } from '@/lib/pb';
import { SubmitButton } from '@/components/forms/submit-button';
import { GoogleAuthButton } from '@/features/auth/components/google-auth-button';
import { TempMailPromo } from '@/features/auth/components/temp-mail-promo';
import { readableAuthError } from '@/features/auth/utils/pb-errors';
import { TEMP_MAIL_ENABLED, TEMP_MAIL_URL } from '@/lib/temp-mail';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required')
});

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';

  const form = useAppForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      try {
        await pbUsers().authWithPassword(value.email, value.password);
        toast.success('Signed in');
        router.replace(next);
      } catch (e) {
        toast.error(readableAuthError(e));
      }
    }
  });

  return (
    <div className='grid gap-6'>
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
              <div>
                <field.TextField label='Email' type='email' placeholder='you@example.com' required />
                {TEMP_MAIL_ENABLED && (
                  <p className='mt-1.5 text-xs text-muted-foreground'>
                    Testing the dashboard?{' '}
                    <a
                      href={TEMP_MAIL_URL}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-primary font-medium underline underline-offset-2 hover:opacity-80'
                    >
                      Test with Temp Mail ↗
                    </a>
                  </p>
                )}
              </div>
            )}
          />
          <form.AppField
            name='password'
            children={(field) => (
              <field.TextField label='Password' type='password' placeholder='••••••••' required />
            )}
          />
          <div className='flex justify-end'>
            <Link
              href='/forgot-password'
              className='text-muted-foreground hover:text-primary text-sm underline-offset-4 hover:underline'
            >
              Forgot password?
            </Link>
          </div>
          <SubmitButton>Sign in</SubmitButton>
        </form>
      </form.AppForm>

      <div className='relative'>
        <div className='absolute inset-0 flex items-center'>
          <span className='border-t' />
        </div>
        <div className='relative flex justify-center text-xs uppercase'>
          <span className='bg-background text-muted-foreground px-2'>or</span>
        </div>
      </div>

      <GoogleAuthButton />

      <TempMailPromo />
    </div>
  );
}
