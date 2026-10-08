/**
 * Links written in a corpus page's markdown, resolved against a page list.
 * Kept apart from corpus.ts, which reads the pinned manifest on import, so
 * the rules here run against any pages.
 */
import path from 'node:path';

import type { DocsPage } from './corpus.ts';

/** The corpus file a relative link in `page`'s markdown points at. */
export const corpusTarget = (page: DocsPage, relative: string): string | undefined =>
    page.corpus_path
        ? path.posix.normalize(path.posix.join(path.posix.dirname(page.corpus_path), relative))
        : undefined;

/** Where the site serves a page's skill zip: scripts/sync-dfo-docs.mjs writes
 *  it to the same path under public/. */
export const bundleHref = (page: DocsPage): string => `/docs/${page.path}.zip`;

/**
 * A resolver for links to skill zips: given a page and a link as written in
 * its markdown, the site URL of the zip when the link points at the
 * `bundle_path` some page in `pages` records, otherwise undefined.
 */
export const bundleLinks = (pages: DocsPage[]) => {
    const byBundlePath = new Map(
        pages.flatMap((page) => (page.bundle_path ? [[page.bundle_path, page] as const] : [])),
    );

    return (page: DocsPage, href: string): string | undefined => {
        const target = /^[^/:#?][^:#?]*$/.test(href) ? corpusTarget(page, href) : undefined;
        const owner = target === undefined ? undefined : byBundlePath.get(target);

        return owner && bundleHref(owner);
    };
};
