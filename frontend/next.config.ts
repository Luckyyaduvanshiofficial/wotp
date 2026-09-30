import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * A production build must know its own public origin.
 *
 * `NEXT_PUBLIC_APP_URL` is what every canonical URL, `sitemap.xml` entry,
 * `robots.txt` rule, OpenGraph tag and `metadataBase` resolves against. When it
 * is unset the build falls back to `http://localhost:3000`, and the result is a
 * site that tells search engines it lives at localhost: nothing ranks, and the
 * mistake is invisible from the outside because the pages themselves look fine.
 *
 * So this fails the build instead. That is deliberately the same posture as the
 * backend, which refuses to boot in production without its secrets, and as
 * `lib/pb.ts`, which already refuses to build without `NEXT_PUBLIC_PB_URL`. On
 * Vercel or Render a failed build leaves the previous deployment serving, so the
 * cost of this check firing is a red build and an email, against a silent SEO
 * regression that nobody notices for weeks.
 *
 * `docker compose build` supplies a localhost default, so local installs are
 * unaffected. This only catches a hosted build that was never configured.
 */
if (process.env.NODE_ENV === 'production' && !(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()) {
  throw new Error(
    'NEXT_PUBLIC_APP_URL is not set.\n\n' +
      'It must be the public origin of THIS deployment, e.g. https://otp.example.com.\n' +
      'Without it, canonical URLs, sitemap.xml, robots.txt and OpenGraph tags would all\n' +
      'point at http://localhost:3000 and the site would not rank for its own name.\n\n' +
      'Set it in your hosting environment (or as a Docker build argument) and rebuild.\n' +
      'See docs/self-hosting.md.'
  );
}

// Define the base Next.js configuration
const baseConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  transpilePackages: ['geist'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  }
};

let configWithPlugins = baseConfig;

// Conditionally enable Sentry configuration
if (!process.env.NEXT_PUBLIC_SENTRY_DISABLED) {
  configWithPlugins = withSentryConfig(configWithPlugins, {
    org: process.env.NEXT_PUBLIC_SENTRY_ORG,
    project: process.env.NEXT_PUBLIC_SENTRY_PROJECT,
    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    tunnelRoute: '/monitoring',

    // Disable Sentry telemetry
    telemetry: false,

    // Sentry v10: moved under webpack namespace
    webpack: {
      reactComponentAnnotation: {
        enabled: true
      },
      treeshake: {
        removeDebugLogging: true
      }
    },

    // Disable source map upload when org/project are not configured
    sourcemaps: {
      disable: !process.env.NEXT_PUBLIC_SENTRY_ORG || !process.env.NEXT_PUBLIC_SENTRY_PROJECT
    }
  });
}

const nextConfig = configWithPlugins;
export default nextConfig;
