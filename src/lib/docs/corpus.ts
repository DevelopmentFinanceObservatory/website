import { readFileSync } from 'node:fs';
import path from 'node:path';

import manifestJson from '@/content/dfo-docs/manifest.json';

import { docsHref } from './href.ts';
import { bundleLinks, corpusTarget } from './links.ts';

/**
 * The dfo-docs corpus, as pinned by scripts/sync-dfo-docs.mjs: the manifest
 * (pages, nav tree, redirects) and the markdown it points at. Build-time
 * only — every docs page is static.
 */

export type DocsPage = {
    id: string;
    path: string;
    title: string;
    kind: 'page' | 'skill' | 'external';
    description?: string;
    corpus_path?: string;
    // The skill's zip in the corpus, for a skill that ships one.
    bundle_path?: string;
    url?: string;
};

export type DocsNavNode = {
    id: string;
    title: string;
    kind: 'page' | 'skill' | 'external' | 'group';
    // A group that also has an index page of its own.
    page_id?: string;
    children?: DocsNavNode[];
};

const CONTENT = path.join(process.cwd(), 'src/content/dfo-docs');

// Typed by hand (the JSON import infers a union per example), and
// `redirects` is optional — this pin's manifest carries none.
const manifest = manifestJson as unknown as {
    pages: DocsPage[];
    nav: DocsNavNode[];
    redirects?: { from: string; to: string }[];
};

export const DOCS_PAGES = manifest.pages;
export const DOCS_NAV = manifest.nav;

const byId = new Map(DOCS_PAGES.map((page) => [page.id, page]));
const byPath = new Map(DOCS_PAGES.map((page) => [page.path, page]));
const byCorpusPath = new Map(DOCS_PAGES.map((page) => [page.corpus_path, page]));
const redirects = new Map((manifest.redirects ?? []).map((r) => [r.from, r.to]));

export { docsHref };

export const docsPageById = (id: string): DocsPage | undefined => byId.get(id);
export const docsPageByPath = (pagePath: string): DocsPage | undefined => byPath.get(pagePath);
export const docsRedirect = (pagePath: string): string | undefined => redirects.get(pagePath);
export const docsRedirectPaths = (): string[] => [...redirects.keys()];

/** The page's markdown, frontmatter stripped. */
export const docsMarkdown = (page: DocsPage): string =>
    page.corpus_path
        ? readFileSync(path.join(CONTENT, page.corpus_path), 'utf8').replace(
              /^---\n[\s\S]*?\n---\n/,
              '',
          )
        : '';

/** The site URL of the skill zip a link in `page`'s markdown points at, when
 *  it points at one the manifest records. */
export const docsBundleLink = bundleLinks(DOCS_PAGES);

/** A link as written in `page`'s markdown, pointed at the site: a relative
 *  `.md` link becomes that page's /docs URL (anchor kept); anything else
 *  stays as it is. */
export const docsLink = (page: DocsPage, href: string): string => {
    const match = href.match(/^([^:#?]+\.md)(#.*)?$/);
    const file = match ? corpusTarget(page, match[1]!) : undefined;

    if (!match || file === undefined) {
        return href;
    }

    const target = byCorpusPath.get(file);

    return target ? `${docsHref(target.path)}${match[2] ?? ''}` : href;
};

/** The breadcrumb for a page: the titles of the nav groups above it, walked
 *  from the manifest's nav tree (a group's own index page stops at itself). */
export const docsTrail = (id: string): string[] => {
    const find = (nodes: DocsNavNode[], trail: string[]): string[] | null => {
        for (const node of nodes) {
            if (node.id === id || node.page_id === id) {
                return trail;
            }

            const hit = find(node.children ?? [], [...trail, node.title]);

            if (hit) {
                return hit;
            }
        }

        return null;
    };

    return find(DOCS_NAV, []) ?? [];
};

/** GitHub-style heading anchor, so in-page links written against GitHub keep working. */
export const docsSlug = (text: string): string =>
    text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
