/**
 * The public origin this dashboard is served from.
 *
 * Read from `NEXT_PUBLIC_APP_URL`, which every real deployment must set (it is
 * inlined at build time — see `docs/self-hosting.md`).
 *
 * The fallback is **localhost on purpose**. This project is self-hosted by
 * whoever runs it, so a missing value must never silently produce canonical
 * URLs, sitemap entries, robots rules or OpenGraph tags that point at somebody
 * else's domain. A wrong-but-obvious localhost is a bug you notice; a
 * plausible real hostname is one you never do.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
  /\/+$/,
  ''
);
