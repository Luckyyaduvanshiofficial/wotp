import Link from 'next/link';
import { GithubStar, fetchStars } from '@/features/landing/components/github-star';
import { ThemeToggle } from '@/features/landing/components/theme-toggle';

/**
 * The floating pill, shared by every Lumen surface so the public pages can
 * never drift apart. Async because it resolves the star count itself; that
 * fetch is cached for an hour, so rendering this on more than one page still
 * costs one upstream request.
 */
export async function SiteNav() {
  const stars = await fetchStars();

  return (
    <nav className='lm-nav' aria-label='primary'>
      <Link href='/' className='lm-nav__brand'>
        wa otp
      </Link>
      <Link href='/telegram' className='lm-nav__link lm-nav__link--drop'>
        telegram
      </Link>
      <Link href='/docs' className='lm-nav__link lm-nav__link--drop'>
        docs
      </Link>
      <GithubStar stars={stars} />
      <ThemeToggle />
      {/* No "start free" CTA. Sign in stays — it is the operator's own way into
          the dashboard. The call to action is the repository, which the
          env-driven GitHub link above already provides. */}
      <Link href='/login' className='lm-nav__link lm-nav__link--drop'>
        sign in
      </Link>
    </nav>
  );
}
