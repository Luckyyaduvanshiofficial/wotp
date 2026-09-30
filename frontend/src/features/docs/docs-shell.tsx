import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteFooter } from '@/features/landing/components/site-footer';
import { SiteNav } from '@/features/landing/components/site-nav';
import { SITE_URL } from '@/lib/site';
import { DOCS_HUB, DOCS_PAGES } from './docs-nav';

/**
 * One shell for every docs page: the floating pill nav everyone shares, a
 * reading column, and a rail that carries the section index.
 *
 * The rail is the same sticky 14rem column the single-page reference already
 * used (`lm-docs__grid`), so a multi-page section costs no new layout — just a
 * nav rendered into the slot the table of contents occupies.
 *
 * Breadcrumbs are emitted as structured data rather than drawn: Google renders
 * them in the snippet, and a visible trail above an h1 that already sits under
 * a labelled nav is furniture.
 */
export function DocsShell({
  current,
  eyebrow,
  title,
  lede,
  actions,
  children
}: {
  current: string;
  eyebrow: string;
  title: ReactNode;
  lede: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const here = DOCS_PAGES.find((p) => p.href === current);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Docs', item: `${SITE_URL}/docs` },
      ...(here
        ? [{ '@type': 'ListItem', position: 3, name: here.label, item: `${SITE_URL}${here.href}` }]
        : [])
    ]
  };

  return (
    <div className='lm lm-shell'>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className='lm-blueprint' aria-hidden='true' />

      <SiteNav />

      <header className='lm-docs__hero'>
        <div className='lm-head'>
          <p className='lm-eyebrow'>{eyebrow}</p>
          <h1 className='lm-display'>{title}</h1>
          <p className='lm-lede'>{lede}</p>
        </div>
        {actions ? <div className='lm-actions'>{actions}</div> : null}
      </header>

      <main className='lm-docs__grid lm-docs__grid--section'>
        <article className='lm-prose'>
          {children}

          {/* The rail is hidden below 64rem, so the section index has to exist
              here too or every docs page becomes a dead end on a phone. */}
          <nav className='lm-docsnav__mobile' aria-label='docs section'>
            <p className='lm-docs__toc-label'>more docs</p>
            {DOCS_PAGES.filter((p) => p.href !== current).map((page) => (
              <Link key={page.href} href={page.href} className='lm-docsnav__link'>
                {page.label}
              </Link>
            ))}
            <Link href={DOCS_HUB.href} className='lm-docsnav__link'>
              {DOCS_HUB.label}
            </Link>
          </nav>
        </article>

        <nav className='lm-docs__toc lm-docsnav' aria-label='docs'>
          <p className='lm-docs__toc-label'>docs</p>
          <ul className='lm-docsnav__list'>
            <li>
              <Link
                href={DOCS_HUB.href}
                className='lm-docsnav__link'
                aria-current={current === DOCS_HUB.href ? 'page' : undefined}
              >
                {DOCS_HUB.label}
              </Link>
            </li>
            {DOCS_PAGES.map((page) => (
              <li key={page.href}>
                <Link
                  href={page.href}
                  className='lm-docsnav__link'
                  aria-current={current === page.href ? 'page' : undefined}
                >
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className='lm-docsnav__foot'>
            <Link href='/try' className='lm-docsnav__cta'>
              try it in the browser
            </Link>
          </p>
        </nav>
      </main>

      <SiteFooter />
    </div>
  );
}
