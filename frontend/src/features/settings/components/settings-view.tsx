'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { pb, pbUsers, type WaotpUser } from '@/lib/pb';
import { ThemeModeToggle } from '@/components/themes/theme-mode-toggle';
import { ThemeSelector } from '@/components/themes/theme-selector';
import { CopyButton } from '@/components/copy-button';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { z } from 'zod';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(64, 'Name is too long')
});

function ProfileFormCard() {
  const [user, setUser] = React.useState<WaotpUser | null>(
    (pb.authStore.record as unknown as WaotpUser | null) ?? null
  );
  const [saving, setSaving] = React.useState(false);

  const form = useAppForm({
    defaultValues: { name: user?.name ?? '' },
    validators: { onSubmit: profileSchema },
    onSubmit: async ({ value }) => {
      const currentId = pb.authStore.record?.id;
      if (!currentId) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      setSaving(true);
      try {
        await pbUsers().update(currentId, { name: value.name.trim() });
        await pbUsers().authRefresh();
        const updated = pb.authStore.record as unknown as WaotpUser | null;
        setUser(updated);
        toast.success('Profile name updated');
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Could not update profile. Please try again.';
        toast.error(message);
      } finally {
        setSaving(false);
      }
    }
  });

  React.useEffect(() => {
    const record = pb.authStore.record as unknown as WaotpUser | null;
    if (record) {
      setUser(record);
      form.reset({ name: record.name ?? '' });
    }

    const unsub = pb.authStore.onChange((_token, model) => {
      const updated = model as unknown as WaotpUser | null;
      setUser(updated);
      if (updated) {
        form.reset({ name: updated.name ?? '' });
      }
    });

    return () => unsub();
  }, [form]);

  return (
    <Card className='border shadow-sm'>
      <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3 border-b bg-muted/20'>
        <CardTitle className='text-base font-semibold flex items-center gap-2'>
          <Icons.user className='size-4 text-primary' />
          Personal Details
        </CardTitle>
        <CardDescription className='text-xs'>
          Update your public developer name displayed across the dashboard
        </CardDescription>
      </CardHeader>
      <CardContent className='p-4 sm:p-6'>
        <form.AppForm>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
            className='grid max-w-md gap-4'
          >
            <form.AppField
              name='name'
              children={(field) => (
                <field.TextField label='Display Name' placeholder='e.g. Lucky Developer' required />
              )}
            />
            <div className='flex items-center gap-3'>
              <form.SubmitButton disabled={saving}>
                {saving ? 'Saving changes…' : 'Save Changes'}
              </form.SubmitButton>
            </div>
          </form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}

const passwordSchema = z
  .object({
    oldPassword: z.string().min(1, 'Current password is required'),
    password: z.string().min(8, 'Use at least 8 characters'),
    passwordConfirm: z.string().min(1, 'Confirm your new password')
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Passwords do not match'
  });

function PasswordCard() {
  const [saving, setSaving] = React.useState(false);

  const form = useAppForm({
    defaultValues: { oldPassword: '', password: '', passwordConfirm: '' },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      const currentId = pb.authStore.record?.id;
      if (!currentId) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      setSaving(true);
      try {
        await pbUsers().update(currentId, {
          oldPassword: value.oldPassword,
          password: value.password,
          passwordConfirm: value.passwordConfirm
        });
        await pbUsers().authRefresh();
        toast.success('Password changed successfully');
        form.reset({ oldPassword: '', password: '', passwordConfirm: '' });
      } catch (err: unknown) {
        const pbErr = err as { data?: { message?: string }; message?: string };
        const msg =
          pbErr?.data?.message ||
          pbErr?.message ||
          'Could not change password — is your current password correct?';
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    }
  });

  return (
    <Card className='border shadow-sm'>
      <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3 border-b bg-muted/20'>
        <CardTitle className='text-base font-semibold flex items-center gap-2'>
          <Icons.lock className='size-4 text-primary' />
          Security & Password
        </CardTitle>
        <CardDescription className='text-xs'>
          Change your account password to keep your developer credentials secure
        </CardDescription>
      </CardHeader>
      <CardContent className='p-4 sm:p-6'>
        <form.AppForm>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
            className='grid max-w-md gap-4'
          >
            <form.AppField
              name='oldPassword'
              children={(field) => (
                <field.TextField label='Current Password' type='password' required />
              )}
            />
            <form.AppField
              name='password'
              children={(field) => (
                <field.TextField
                  label='New Password'
                  type='password'
                  placeholder='Minimum 8 characters'
                  required
                />
              )}
            />
            <form.AppField
              name='passwordConfirm'
              children={(field) => (
                <field.TextField label='Confirm New Password' type='password' required />
              )}
            />
            <div>
              <form.SubmitButton disabled={saving}>
                {saving ? 'Updating password…' : 'Update Password'}
              </form.SubmitButton>
            </div>
          </form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}

function AppearanceCard() {
  return (
    <Card className='border shadow-sm'>
      <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3 border-b bg-muted/20'>
        <CardTitle className='text-base font-semibold flex items-center gap-2'>
          <Icons.palette className='size-4 text-primary' />
          Appearance & Theme
        </CardTitle>
        <CardDescription className='text-xs'>
          Customize your dashboard display mode and theme accents
        </CardDescription>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 flex flex-wrap items-center gap-4'>
        <div className='flex flex-col gap-1.5'>
          <span className='text-xs font-medium text-muted-foreground'>Theme Mode</span>
          <ThemeModeToggle />
        </div>
        <Separator orientation='vertical' className='h-8 hidden sm:block' />
        <div className='flex flex-col gap-1.5'>
          <span className='text-xs font-medium text-muted-foreground'>Color Palette</span>
          <ThemeSelector />
        </div>
      </CardContent>
    </Card>
  );
}

function GatewayPreferencesCard() {
  return (
    <Card className='border shadow-sm'>
      <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3 border-b bg-muted/20'>
        <CardTitle className='text-base font-semibold flex items-center gap-2'>
          <Icons.settings className='size-4 text-primary' />
          Developer Gateway Preferences
        </CardTitle>
        <CardDescription className='text-xs'>
          Configuration shortcuts and local client storage
        </CardDescription>
      </CardHeader>
      <CardContent className='p-4 sm:p-6 space-y-4 text-xs sm:text-sm'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b pb-3'>
          <div>
            <p className='font-medium text-foreground'>Active Channels</p>
            <p className='text-muted-foreground text-xs'>
              Telegram OTP (Unmetered, Free) & Meta WhatsApp Cloud API
            </p>
          </div>
          <Link
            href='/dashboard/tester'
            className='inline-flex items-center gap-1 font-semibold text-primary hover:underline text-xs'
          >
            <span>Open Tester</span>
            <Icons.arrowRight className='size-3' />
          </Link>
        </div>

        <div className='flex flex-wrap items-center justify-between gap-2 border-b pb-3'>
          <div>
            <p className='font-medium text-foreground'>API Keys</p>
            <p className='text-muted-foreground text-xs'>
              Manage bearer tokens and service keys for backend communication
            </p>
          </div>
          <Link
            href='/dashboard/keys'
            className='inline-flex items-center gap-1 font-semibold text-primary hover:underline text-xs'
          >
            <span>Manage Keys</span>
            <Icons.arrowRight className='size-3' />
          </Link>
        </div>

        <div className='flex flex-wrap items-center justify-between gap-2 pt-1'>
          <div>
            <p className='font-medium text-foreground'>Tester API Key</p>
            <p className='text-muted-foreground text-xs'>
              The OTP Tester holds a key in memory for the current tab only — nothing is written to
              browser storage, so there is no cache to clear.
            </p>
          </div>
          <Link
            href='/dashboard/tester'
            className='inline-flex items-center gap-1 font-semibold text-primary hover:underline text-xs'
          >
            <span>Open Tester</span>
            <Icons.arrowRight className='size-3' />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function UserSidebarCard({ onSignOut }: { onSignOut: () => void }) {
  const [user, setUser] = React.useState<WaotpUser | null>(
    (pb.authStore.record as unknown as WaotpUser | null) ?? null
  );

  React.useEffect(() => {
    const record = pb.authStore.record as unknown as WaotpUser | null;
    if (record) setUser(record);

    const unsub = pb.authStore.onChange((_token, model) => {
      setUser(model as unknown as WaotpUser | null);
    });
    return () => unsub();
  }, []);

  const name = user?.name || '';
  const email = user?.email || '';
  const initials = name
    ? name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : email.slice(0, 2).toUpperCase();

  return (
    <Card className='border shadow-sm flex flex-col justify-between'>
      <CardHeader className='p-4 sm:p-6 pb-3 text-center flex flex-col items-center'>
        <Avatar className='size-16 rounded-xl border-2 border-primary/20 shadow-xs mb-2'>
          <AvatarImage
            src={user?.avatar ? pb.files.getURL(user, user.avatar as string) : undefined}
            alt={name || email}
          />
          <AvatarFallback className='rounded-xl bg-primary/10 text-primary text-xl font-bold'>
            {initials || '?'}
          </AvatarFallback>
        </Avatar>
        <CardTitle className='text-lg font-bold truncate max-w-full'>
          {name || 'Developer'}
        </CardTitle>
        <CardDescription className='text-xs font-mono truncate max-w-full text-muted-foreground'>
          {email}
        </CardDescription>
        <div className='mt-3 flex flex-wrap items-center justify-center gap-1.5'>
          <Badge
            variant='outline'
            className='border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] gap-1'
          >
            <span className='size-1.5 rounded-full bg-emerald-500' />
            {user?.status || 'Active'}
          </Badge>
          <Badge variant='secondary' className='text-[11px] uppercase'>
            Self-Hosted
          </Badge>
        </div>
      </CardHeader>

      <CardContent className='p-4 sm:p-6 pt-0 space-y-3 text-xs'>
        <Separator />
        <div className='flex items-center justify-between py-1'>
          <span className='text-muted-foreground'>Account ID</span>
          <div className='flex items-center gap-1'>
            <span className='font-mono text-[11px]'>
              {user?.id ? `${user.id.slice(0, 8)}…` : '—'}
            </span>
            {user?.id && <CopyButton value={user.id} className='size-6 p-0 text-[10px]' />}
          </div>
        </div>
        <div className='flex items-center justify-between py-1'>
          <span className='text-muted-foreground'>Deployment</span>
          <span className='font-medium text-emerald-600 dark:text-emerald-400'>
            Self-Hosted Gateway
          </span>
        </div>
        <div className='flex items-center justify-between py-1'>
          <span className='text-muted-foreground'>Telegram Channel</span>
          <span className='font-medium text-sky-600 dark:text-sky-400'>Unmetered</span>
        </div>
      </CardContent>

      <CardContent className='p-4 sm:p-6 pt-0 border-t bg-muted/10'>
        <Button
          variant='outline'
          size='sm'
          onClick={onSignOut}
          className='w-full text-destructive hover:bg-destructive/10 hover:text-destructive text-xs font-medium'
        >
          <Icons.logout className='size-3.5 mr-1.5' />
          Sign Out of Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}

export function SettingsView() {
  const router = useRouter();

  async function signOut() {
    pb.authStore.clear();
    toast.success('Signed out');
    router.push('/login');
  }

  return (
    <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'>
      {/* Left Column: Account Profile Summary */}
      <div className='lg:col-span-4'>
        <UserSidebarCard onSignOut={signOut} />
      </div>

      {/* Right Column: Settings Forms & Preferences */}
      <div className='lg:col-span-8 flex flex-col gap-6'>
        <ProfileFormCard />
        <PasswordCard />
        <AppearanceCard />
        <GatewayPreferencesCard />
      </div>
    </div>
  );
}
