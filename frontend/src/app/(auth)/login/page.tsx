import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/components/login-form';
import { RedirectIfAuthed } from '@/components/guards/redirect-if-authed';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <RedirectIfAuthed>
      <section className='lm-auth__card'>
        <div className='lm-auth__head'>
          <p className='lm-eyebrow'>sign in</p>
          <h1 className='lm-auth__title'>welcome back.</h1>
          <p className='lm-auth__lede'>your api keys and your monthly sends, in one place.</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
      {/* No signup link on purpose: this dashboard is operator-only. The first
          account is created with `scripts/create_admin.py` on the server. */}
      <p className='lm-auth__alt'>
        this installation has no public signup — the operator account is created with{' '}
        <code>scripts/create_admin.py</code>.
      </p>
    </RedirectIfAuthed>
  );
}
