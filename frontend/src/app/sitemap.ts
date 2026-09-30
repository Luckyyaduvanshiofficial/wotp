import type { MetadataRoute } from 'next';
import { DOCS_PAGES } from '@/features/docs/docs-nav';
import { SITE_URL } from '@/lib/site';

/**
 * Sitemap.
 *
 * Priority reflects how much each page is the answer to a real search query,
 * not how much we like it. The docs topic pages are the ones written to rank,
 * so they sit above the legal pages, which exist for completeness and are the
 * same three paragraphs on every website.
 *
 * The docs entries are derived from `DOCS_PAGES` rather than typed out, because
 * a page that exists but is missing from the sitemap is an orphan, and orphans
 * are what a hand-maintained list eventually produces.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes = [
    // 1.0 — the page people arrive on for the primary query.
    { path: '', changeFrequency: 'weekly' as const, priority: 1.0 },

    // 0.9 — the free-channel landing page and the two highest-intent docs pages.
    { path: '/telegram', changeFrequency: 'weekly' as const, priority: 0.9 },
    { path: '/docs/whatsapp', changeFrequency: 'weekly' as const, priority: 0.9 },
    { path: '/docs/telegram', changeFrequency: 'weekly' as const, priority: 0.9 },
    { path: '/docs/faq', changeFrequency: 'weekly' as const, priority: 0.9 },

    // 0.8 — the interactive surface and the docs hub.
    { path: '/try', changeFrequency: 'weekly' as const, priority: 0.8 },
    { path: '/docs', changeFrequency: 'weekly' as const, priority: 0.8 },
    { path: '/docs/quickstart', changeFrequency: 'weekly' as const, priority: 0.8 },
    { path: '/docs/self-hosting', changeFrequency: 'weekly' as const, priority: 0.8 },
    { path: '/docs/api', changeFrequency: 'weekly' as const, priority: 0.8 },

    // 0.6 — supporting project pages.
    { path: '/changelog', changeFrequency: 'weekly' as const, priority: 0.6 },
    { path: '/report-bug', changeFrequency: 'monthly' as const, priority: 0.6 },
    { path: '/contact', changeFrequency: 'monthly' as const, priority: 0.6 },

    // 0.3 — legal and auth. Listed so they are reachable, ranked under nothing.
    { path: '/privacy', changeFrequency: 'yearly' as const, priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly' as const, priority: 0.3 },
    { path: '/disclaimer', changeFrequency: 'yearly' as const, priority: 0.3 },
    { path: '/login', changeFrequency: 'yearly' as const, priority: 0.3 }
  ];

  // Guard against a docs page being added to the nav and forgotten here.
  const listed = new Set(routes.map((r) => r.path));
  for (const page of DOCS_PAGES) {
    if (!listed.has(page.href)) {
      routes.push({ path: page.href, changeFrequency: 'weekly' as const, priority: 0.7 });
    }
  }

  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority
  }));
}
