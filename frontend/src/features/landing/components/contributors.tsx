import * as React from 'react';
import Image from 'next/image';
import { Icons } from '@/components/icons';
import { fetchContributors, GITHUB_URL } from '@/features/landing/components/github-star';

export async function ContributorsSection() {
  const contributors = await fetchContributors();

  return (
    <section className='lm-section' id='contributors' aria-labelledby='contributors-h'>
      <div className='lm-head'>
        <p className='lm-eyebrow'>open source community</p>
        <h2 className='lm-h2' id='contributors-h'>
          built in the open with our community.
        </h2>
        <p className='lm-lede'>
          WA OTP is 100% free and open source. From core FastAPI Python architecture to the
          responsive Next.js dashboard, we welcome developers worldwide to inspect the code, file
          bug reports, and submit contributions.
        </p>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-4'>
        {contributors.map((c) => (
          <a
            key={c.login}
            href={c.html_url}
            target='_blank'
            rel='noreferrer'
            className='flex items-center gap-3.5 rounded-xl border border-[var(--rule)] bg-[var(--color-paper-elevated)] p-4 transition-all hover:border-[var(--color-accent)] hover:shadow-xs group'
          >
            <div className='relative size-11 shrink-0 overflow-hidden rounded-full border border-[var(--rule)]'>
              <Image
                src={c.avatar_url}
                alt={c.login}
                fill
                sizes='44px'
                className='object-cover'
                unoptimized
              />
            </div>
            <div className='min-w-0 flex-1'>
              <div className='flex items-center justify-between gap-1'>
                <p className='font-semibold text-sm text-[var(--color-ink)] truncate group-hover:text-[var(--color-accent)]'>
                  @{c.login}
                </p>
                <Icons.externalLink className='size-3 text-[var(--color-ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity' />
              </div>
              <p className='text-xs text-[var(--color-ink-muted)]'>
                {c.contributions} {c.contributions === 1 ? 'commit' : 'commits'}
              </p>
            </div>
          </a>
        ))}
      </div>

      <div className='flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[var(--rule)]'>
        <div className='flex items-center gap-2 text-xs text-[var(--color-ink-muted)]'>
          <span>Project Lead:</span>
          <a
            href='https://luckyyaduvanshi.in/'
            target='_blank'
            rel='noreferrer'
            className='font-semibold text-[var(--color-ink)] hover:text-[var(--color-accent)] underline underline-offset-2'
          >
            Lucky Yaduvanshi
          </a>
        </div>
        <div className='flex items-center gap-3'>
          <a
            href={`${GITHUB_URL}/graphs/contributors`}
            target='_blank'
            rel='noreferrer'
            className='text-xs font-semibold text-[var(--color-accent)] hover:underline inline-flex items-center gap-1.5'
          >
            <span>View all contributors on GitHub</span>
            <Icons.arrowRight className='size-3' />
          </a>
        </div>
      </div>
    </section>
  );
}
