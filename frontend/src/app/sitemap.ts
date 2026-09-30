import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${SITE_URL}`;
  const now = new Date();

  const routes = [
    { path: '', changeFrequency: 'weekly' as const, priority: 1.0 },
    { path: '/telegram', changeFrequency: 'weekly' as const, priority: 0.95 },
    { path: '/docs', changeFrequency: 'weekly' as const, priority: 0.9 },
    { path: '/changelog', changeFrequency: 'weekly' as const, priority: 0.8 },
    { path: '/report-bug', changeFrequency: 'monthly' as const, priority: 0.7 },
    { path: '/privacy', changeFrequency: 'monthly' as const, priority: 0.5 },
    { path: '/terms', changeFrequency: 'monthly' as const, priority: 0.5 },
    { path: '/disclaimer', changeFrequency: 'monthly' as const, priority: 0.5 },
    { path: '/contact', changeFrequency: 'monthly' as const, priority: 0.6 },
    { path: '/login', changeFrequency: 'monthly' as const, priority: 0.4 },
    { path: '/signup', changeFrequency: 'monthly' as const, priority: 0.6 }
  ];

  return routes.map((r) => ({
    url: `${baseUrl}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority
  }));
}
