import * as React from 'react';
import Link from 'next/link';
import { GITHUB_URL } from '@/features/landing/components/github-star';
import { TEMP_MAIL_ENABLED, TEMP_MAIL_URL } from '@/lib/temp-mail';

export function SiteFooter() {
  return (
    <footer className='lm-foot'>
      <p className='lm-foot__stmt'>send a code. check a code. keep the data.</p>

      {/* Navigation Grid */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-t border-[var(--rule)]'>
        <div className='space-y-3'>
          <h3 className='font-mono text-xs uppercase tracking-wider text-[var(--color-ink)] font-bold'>
            Product
          </h3>
          <ul className='space-y-2 text-xs text-[var(--color-ink-muted)]'>
            <li>
              <Link href='/' className='hover:text-[var(--color-accent)] transition-colors'>
                WhatsApp OTP Gateway
              </Link>
            </li>
            <li>
              <Link href='/telegram' className='hover:text-[var(--color-accent)] transition-colors'>
                Telegram OTP Gateway
              </Link>
            </li>
            <li>
              <Link href='/docs' className='hover:text-[var(--color-accent)] transition-colors'>
                API Documentation
              </Link>
            </li>
            <li>
              <Link href='/try' className='hover:text-[var(--color-accent)] transition-colors'>
                Try It in the Browser
              </Link>
            </li>
            <li>
              <Link
                href='/changelog'
                className='hover:text-[var(--color-accent)] transition-colors'
              >
                Changelog & Releases
              </Link>
            </li>
          </ul>
        </div>

        <div className='space-y-3'>
          <h3 className='font-mono text-xs uppercase tracking-wider text-[var(--color-ink)] font-bold'>
            Developer
          </h3>
          <ul className='space-y-2 text-xs text-[var(--color-ink-muted)]'>
            {GITHUB_URL ? (
              <li>
                <a
                  href={GITHUB_URL}
                  target='_blank'
                  rel='noreferrer'
                  className='hover:text-[var(--color-accent)] transition-colors'
                >
                  GitHub Repository
                </a>
              </li>
            ) : null}
            <li>
              <Link
                href='/report-bug'
                className='hover:text-[var(--color-accent)] transition-colors'
              >
                Report a Bug
              </Link>
            </li>
            <li>
              <a
                href={`${GITHUB_URL}/issues`}
                target='_blank'
                rel='noreferrer'
                className='hover:text-[var(--color-accent)] transition-colors'
              >
                Issue Tracker
              </a>
            </li>
            <li>
              <Link href='/docs' className='hover:text-[var(--color-accent)] transition-colors'>
                Self-Hosting Guide
              </Link>
            </li>
          </ul>
        </div>

        <div className='space-y-3'>
          <h3 className='font-mono text-xs uppercase tracking-wider text-[var(--color-ink)] font-bold'>
            CodaiPro Tools
          </h3>
          <ul className='space-y-2 text-xs text-[var(--color-ink-muted)]'>
            <li>
              <a
                href='https://codaipro.com/'
                target='_blank'
                rel='noreferrer'
                className='hover:text-[var(--color-accent)] transition-colors font-medium text-[var(--color-ink)]'
              >
                CodaiPro Developer Tools ↗
              </a>
            </li>
            {TEMP_MAIL_ENABLED && (
              <li>
                <a
                  href={TEMP_MAIL_URL}
                  target='_blank'
                  rel='noreferrer'
                  className='hover:text-[var(--color-accent)] transition-colors'
                >
                  Temp Mail — Disposable Inbox ↗
                </a>
              </li>
            )}
            <li>
              <a
                href='https://codaipro.com/'
                target='_blank'
                rel='noreferrer'
                className='hover:text-[var(--color-accent)] transition-colors'
              >
                Free Online Utilities ↗
              </a>
            </li>
          </ul>
        </div>

        <div className='space-y-3'>
          <h3 className='font-mono text-xs uppercase tracking-wider text-[var(--color-ink)] font-bold'>
            Legal & About
          </h3>
          <ul className='space-y-2 text-xs text-[var(--color-ink-muted)]'>
            <li>
              <Link href='/privacy' className='hover:text-[var(--color-accent)] transition-colors'>
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href='/terms' className='hover:text-[var(--color-accent)] transition-colors'>
                Terms & Conditions
              </Link>
            </li>
            <li>
              <Link
                href='/disclaimer'
                className='hover:text-[var(--color-accent)] transition-colors'
              >
                Disclaimer
              </Link>
            </li>
            <li>
              <Link href='/contact' className='hover:text-[var(--color-accent)] transition-colors'>
                Contact & Support
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Attribution & Copyright */}
      <div className='lm-foot__meta'>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
          <span>wotp · open source</span>
          <span>•</span>
          <span>
            Designed & Developed by{' '}
            <a
              href='https://luckyyaduvanshi.in/'
              target='_blank'
              rel='noreferrer'
              className='font-semibold underline underline-offset-2 hover:text-[var(--color-accent)]'
            >
              Lucky Yaduvanshi
            </a>
          </span>
        </div>

        <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
          <a href='https://codaipro.com/' target='_blank' rel='noreferrer'>
            CodaiPro Platform
          </a>
          <span>•</span>
          {GITHUB_URL ? (
            <a href={GITHUB_URL} target='_blank' rel='noreferrer'>
              GitHub
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
