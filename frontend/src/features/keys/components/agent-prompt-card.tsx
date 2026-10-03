'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/copy-button';
import { Icons } from '@/components/icons';
import { API_URL } from '@/lib/api';
import { BRIEFING_PATH, buildAgentPrompt } from '@/lib/agent-prompt';

/**
 * Offers the whole integration as one paste, for a coding agent.
 *
 * It has to live on the key-reveal moment rather than anywhere permanent: the
 * plaintext key exists in the UI once and is never recoverable afterwards by
 * design, so this is the only point at which a prompt can be generated with the
 * key already in it.
 *
 * The briefing is fetched rather than bundled so the prompt can never carry a
 * stale copy of the contract. Loading it up front — instead of inside the click
 * handler — keeps the clipboard write in the same task as the user gesture,
 * which Safari requires.
 */
export function AgentPromptCard({ apiKey }: { apiKey: string }) {
  const [briefing, setBriefing] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    fetch(BRIEFING_PATH)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((text) => {
        if (!cancelled) setBriefing(text);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const prompt = briefing ? buildAgentPrompt(briefing, apiKey) : null;

  return (
    <div className='rounded-lg border p-5 space-y-4'>
      <div className='flex items-start gap-3'>
        <Icons.sparkles className='text-primary mt-0.5 size-5 shrink-0' />
        <div>
          <p className='font-semibold'>Let your AI agent do the wiring</p>
          <p className='text-muted-foreground text-sm'>
            Copies the full integration contract with your URL and key already filled in. Paste it
            into Claude, Cursor, Codex or any other coding agent and it can build the integration
            without asking you for anything else.
          </p>
        </div>
      </div>

      <div className='bg-muted/40 space-y-1 rounded-lg border p-3 font-mono text-xs'>
        <div className='truncate'>
          <span className='text-muted-foreground'>WOTP_API=</span>
          {API_URL.replace(/\/+$/, '')}
        </div>
        <div>
          <span className='text-muted-foreground'>WOTP_KEY=</span>
          <span className='tracking-widest'>••••••••••••</span>
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-3'>
        {prompt ? (
          <CopyButton value={prompt}>Copy setup prompt</CopyButton>
        ) : (
          <Button variant='outline' size='sm' disabled>
            {failed ? <Icons.warning className='size-3.5' /> : <Icons.copy className='size-3.5' />}
            {failed ? 'Prompt unavailable' : 'Preparing prompt…'}
          </Button>
        )}
        <a
          href={BRIEFING_PATH}
          target='_blank'
          rel='noreferrer'
          className='text-muted-foreground hover:text-foreground text-xs underline underline-offset-4'
        >
          what the agent receives
        </a>
      </div>

      <p className='text-muted-foreground text-xs'>
        The prompt contains your live key, so paste it only into an agent you trust. It also tells
        the agent to keep the key in an environment variable rather than in your source.
      </p>
    </div>
  );
}
