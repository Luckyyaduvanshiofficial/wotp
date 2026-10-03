'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createKey,
  deactivateKey,
  errorMessage,
  isApiError,
  listKeys,
  regenerateKeys,
  type ApiKey,
  type CreatedKey
} from '@/lib/api';
import { stashPlaintextKey } from '@/lib/key-handoff';
import { KeyReveal } from '@/features/keys/components/key-reveal';
import { AgentPromptCard } from '@/features/keys/components/agent-prompt-card';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingButton } from '@/components/ui/loading-button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

const MAX_ACTIVE_KEYS = 5;

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function KeysView() {
  const queryClient = useQueryClient();
  const keysQuery = useQuery({ queryKey: ['keys'], queryFn: listKeys, retry: 1 });

  // New key dialog + one-time reveal
  const [newKeyOpen, setNewKeyOpen] = React.useState(false);
  const [newKeyLabel, setNewKeyLabel] = React.useState('');
  const [revealed, setRevealed] = React.useState<CreatedKey | null>(null);

  // Regenerate dialog
  const [regenOpen, setRegenOpen] = React.useState(false);
  const [regenLabel, setRegenLabel] = React.useState('');

  // Deactivate target
  const [deactivateTarget, setDeactivateTarget] = React.useState<ApiKey | null>(null);

  const refreshKeys = () => queryClient.invalidateQueries({ queryKey: ['keys'] });

  const createMutation = useMutation({
    mutationFn: () => createKey(newKeyLabel.trim() || 'unnamed'),
    onSuccess: (key) => {
      setNewKeyOpen(false);
      setNewKeyLabel('');
      setRevealed(key);
      stashPlaintextKey({ api_key: key.api_key, last4: key.last4, label: key.label });
      void refreshKeys();
    },
    onError: (e) => toast.error(errorMessage(e))
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateKeys(regenLabel.trim() || 'regenerated'),
    onSuccess: (key) => {
      setRegenOpen(false);
      setRegenLabel('');
      setRevealed(key);
      stashPlaintextKey({ api_key: key.api_key, last4: key.last4, label: key.label });
      void refreshKeys();
    },
    onError: (e) => toast.error(errorMessage(e))
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateKey(id),
    onSuccess: () => {
      toast.success('Key deactivated');
      setDeactivateTarget(null);
      void refreshKeys();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeactivateTarget(null);
    }
  });

  const keys = keysQuery.data?.keys ?? [];
  const activeCount = keys.filter((k) => k.active).length;

  function openNewKeyDialog() {
    if (isApiError(keysQuery.error) && keysQuery.error.code === 'key_limit_reached') return;
    if (activeCount >= MAX_ACTIVE_KEYS) {
      toast.error(`You already have ${MAX_ACTIVE_KEYS} active keys. Deactivate one first.`);
      return;
    }
    setNewKeyOpen(true);
  }

  return (
    <div className='grid gap-4'>
      {revealed && (
        <>
          <KeyReveal
            apiKey={revealed.api_key}
            last4={revealed.last4}
            label={revealed.label}
            onDone={() => setRevealed(null)}
          />
          <AgentPromptCard apiKey={revealed.api_key} />
        </>
      )}

      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div>
            <CardTitle>Your keys</CardTitle>
            <CardDescription>
              {activeCount} of {MAX_ACTIVE_KEYS} active keys · keys are shown in full only once
            </CardDescription>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' onClick={() => setRegenOpen(true)}>
              <Icons.refresh className='size-3.5' />
              Regenerate all
            </Button>
            <Button size='sm' onClick={openNewKeyDialog}>
              <Icons.add className='size-3.5' />
              New key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {keysQuery.isLoading ? (
            <div className='space-y-2'>
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className='h-11 w-full' />
              ))}
            </div>
          ) : keysQuery.isError ? (
            <div className='text-muted-foreground flex flex-col items-center gap-3 py-8 text-center text-sm'>
              <span>{errorMessage(keysQuery.error)}</span>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void keysQuery.refetch()}
                disabled={keysQuery.isFetching}
              >
                <Icons.refresh className='size-3.5' />
                Retry
              </Button>
            </div>
          ) : keys.length === 0 ? (
            <div className='text-muted-foreground flex flex-col items-center gap-3 py-8 text-center text-sm'>
              <Icons.key className='size-8 opacity-40' />
              <span>
                No API keys yet.{' '}
                <button
                  type='button'
                  onClick={openNewKeyDialog}
                  className='text-primary underline underline-offset-4'
                >
                  Create your first key
                </button>{' '}
                to start sending OTPs.
              </span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className='w-24' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className='font-medium'>{k.label || 'Unnamed key'}</TableCell>
                    <TableCell className='font-mono text-xs'>wotp_••••{k.last4}</TableCell>
                    <TableCell>
                      <Badge variant={k.active ? 'secondary' : 'outline'}>
                        {k.active ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {formatDate(k.created)}
                    </TableCell>
                    <TableCell>
                      {k.active && (
                        <Button
                          variant='ghost'
                          size='sm'
                          className='text-destructive hover:text-destructive'
                          onClick={() => setDeactivateTarget(k)}
                        >
                          <Icons.trash className='size-3.5' />
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New key dialog */}
      <Dialog open={newKeyOpen} onOpenChange={setNewKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new API key</DialogTitle>
            <DialogDescription>
              Give the key a label so you can recognise it later. The full key is shown once, right
              after creation.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='new-key-label'>Label</Label>
            <Input
              id='new-key-label'
              placeholder='e.g. production, staging app'
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createMutation.mutate();
              }}
              maxLength={64}
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setNewKeyOpen(false)}>
              Cancel
            </Button>
            <LoadingButton
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create key
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate all dialog */}
      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className='text-destructive'>Regenerate all keys?</AlertDialogTitle>
            <AlertDialogDescription>
              This <strong>deactivates every active key</strong> on your account and issues one new
              key. Any app still using an old key will immediately start failing with 403{' '}
              <span className='font-mono'>key_disabled</span>. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='regen-label'>Label for the new key</Label>
            <Input
              id='regen-label'
              placeholder='e.g. rotated-key'
              value={regenLabel}
              onChange={(e) => setRegenLabel(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <LoadingButton
              variant='destructive'
              loading={regenerateMutation.isPending}
              disabled={regenerateMutation.isPending}
              onClick={() => regenerateMutation.mutate()}
            >
              Yes, deactivate all and issue a new key
            </LoadingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate confirm */}
      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate key ••••{deactivateTarget?.last4}?</AlertDialogTitle>
            <AlertDialogDescription>
              Apps using this key will stop working immediately. Deactivated keys cannot be
              reactivated — create a new key instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <LoadingButton
              variant='destructive'
              loading={deactivateMutation.isPending}
              disabled={deactivateMutation.isPending}
              onClick={() => deactivateTarget && deactivateMutation.mutate(deactivateTarget.id)}
            >
              Deactivate
            </LoadingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className='text-muted-foreground text-sm'>
        New here? The{' '}
        <Link href='/dashboard/tester' className='text-primary underline underline-offset-4'>
          OTP Tester
        </Link>{' '}
        lets you send a real OTP to your own phone with a key.
      </p>
    </div>
  );
}
