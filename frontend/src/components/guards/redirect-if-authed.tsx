'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { pb } from '@/lib/pb';

/**
 * On auth pages (/login, /forgot-password, /reset-password): bounce signed-in
 * users to the dashboard. Renders children once the check completes.
 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    if (pb.authStore.isValid) {
      router.replace('/dashboard');
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked) return null;
  return <>{children}</>;
}
