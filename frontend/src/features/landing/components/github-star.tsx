import { Icons } from '@/components/icons';

/**
 * The repository URL defaults to the official repo if NEXT_PUBLIC_GITHUB_REPO is not set.
 */
export const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || 'Luckyyaduvanshiofficial/wa-otp';

export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

/**
 * Live star count, cached for an hour.
 */
export async function fetchStars(): Promise<number | null> {
  if (!GITHUB_REPO) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: unknown };
    const n = data?.stargazers_count;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export interface Contributor {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

/**
 * Live contributors, cached for 24 hours with fallback.
 */
export async function fetchContributors(): Promise<Contributor[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contributors?per_page=12`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        next: { revalidate: 86400 }
      }
    );
    if (res.ok) {
      const data = (await res.json()) as Contributor[];
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {
    // Graceful fallback
  }

  return [
    {
      login: 'Luckyyaduvanshiofficial',
      id: 201058633,
      avatar_url: 'https://github.com/Luckyyaduvanshiofficial.png',
      html_url: 'https://github.com/Luckyyaduvanshiofficial',
      contributions: 52
    }
  ];
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export function GithubStar({ stars }: { stars: number | null }) {
  if (!GITHUB_URL) return null;

  return (
    <a
      href={GITHUB_URL}
      target='_blank'
      rel='noreferrer'
      className='lm-nav__link lm-nav__link--gh'
      aria-label={stars === null ? 'github repository' : `${stars} stars on github`}
    >
      <Icons.github className='size-4' aria-hidden='true' />
      <span className='lm-nav__gh-count'>{stars === null ? 'star' : compact(stars)}</span>
    </a>
  );
}
