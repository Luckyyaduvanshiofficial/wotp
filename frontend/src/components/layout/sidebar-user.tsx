'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pb } from '@/lib/pb';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { toast } from 'sonner';

export function SidebarUser() {
  const router = useRouter();
  const [record, setRecord] = React.useState(pb.authStore.record);

  React.useEffect(() => {
    setRecord(pb.authStore.record);
    const unsub = pb.authStore.onChange((_token, model) => {
      setRecord(model);
    });
    return () => unsub();
  }, []);

  async function signOut() {
    pb.authStore.clear();
    toast.success('Signed out');
    router.push('/login');
    router.refresh();
  }

  const name = (record?.name as string | undefined) ?? '';
  const email = (record?.email as string | undefined) ?? '';
  const initials = name
    ? name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : email.slice(0, 2).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem className='flex items-center gap-1'>
        <SidebarMenuButton
          size='lg'
          className='flex-1 group cursor-pointer'
          render={
            <Link
              href='/dashboard/settings'
              title='Account Settings'
              aria-label='Account Settings'
            />
          }
        >
          <Avatar className='size-8 shrink-0 rounded-lg'>
            <AvatarImage
              src={record?.avatar ? pb.files.getURL(record, record.avatar as string) : undefined}
              alt={name || email}
            />
            <AvatarFallback className='rounded-lg bg-primary/10 text-primary font-semibold text-xs'>
              {initials || '?'}
            </AvatarFallback>
          </Avatar>
          <div className='grid flex-1 text-left text-sm leading-tight min-w-0'>
            <span className='truncate font-medium group-hover:text-primary transition-colors'>
              {name || email || 'Account'}
            </span>
            {name && <span className='text-muted-foreground truncate text-xs'>{email}</span>}
          </div>
        </SidebarMenuButton>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant='ghost'
                size='icon'
                className='size-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent'
                aria-label='Account options'
              />
            }
          >
            <Icons.chevronsDown className='size-4' />
          </DropdownMenuTrigger>
          <DropdownMenuContent className='w-56 rounded-lg' side='top' align='end' sideOffset={6}>
            <DropdownMenuLabel className='p-0 font-normal'>
              <div className='flex items-center gap-2 px-2 py-1.5 text-left text-sm'>
                <Avatar className='size-7 rounded-md'>
                  <AvatarFallback className='rounded-md bg-primary/10 text-primary text-xs font-semibold'>
                    {initials || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className='grid flex-1 text-left text-xs leading-tight min-w-0'>
                  <span className='truncate font-semibold'>{name || 'Developer'}</span>
                  <span className='text-muted-foreground truncate text-[11px]'>{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => router.push('/dashboard/settings')}
                className='cursor-pointer'
              >
                <Icons.settings className='mr-2 size-4' />
                <span>Account Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push('/dashboard/keys')}
                className='cursor-pointer'
              >
                <Icons.key className='mr-2 size-4' />
                <span>API Keys</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/docs')} className='cursor-pointer'>
                <Icons.book className='mr-2 size-4' />
                <span>Documentation</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void signOut()}
              variant='destructive'
              className='cursor-pointer'
            >
              <Icons.logout className='mr-2 size-4' />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
