/**
 * What a crawler is told: robots.txt keeps it off the routes for programs
 * only, so it can read the `noindex` on the routes that carry one, and the
 * sitemap lists pages it may fetch and index.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match.js';

import type { GalleryItem } from '@/components/organisms/Gallery/galleryData';

import robots from '../../app/robots.ts';
import { dataPageRobots, NOINDEX_ROUTES, noindexHeaders } from '../crawl.ts';
import type { DocsPage } from '../docs/corpus.ts';
import { sitemapPaths } from '../sitemap.ts';

// robots.txt matching as Google does it: a rule matches from the start of
// the path, and `*` stands for any run of characters.
const blocked = (path: string): boolean => {
    const [rule] = [robots().rules].flat();
    const disallow = [rule?.disallow ?? []].flat();

    return disallow.some((pattern) => {
        const literal = pattern
            .split('*')
            .map((part) => part.replace(/[.?+^$()[\]{}|\\]/g, '\\$&'));

        return new RegExp(`^${literal.join('.*')}`).test(path);
    });
};

// The X-Robots-Tag next.config.ts sends for a path, matched the way Next
// matches a header rule's `source`.
const robotsHeader = (path: string): string | undefined =>
    noindexHeaders()
        .filter((rule) => getPathMatch(rule.source)(path) !== false)
        .flatMap((rule) => rule.headers)
        .find((header) => header.key === 'X-Robots-Tag')?.value;

const base = {
    title: 'Item',
    description: '',
    types: [],
    regions: ['africa'],
    sources: ['wb-ids'],
} as const;

const gallery: GalleryItem[] = [
    { ...base, slug: 'a-card', kind: 'card', sharedFrom: 'aaaaaaaa', live: true },
    { ...base, slug: 'a-search', kind: 'dataset', sharedFrom: 'bbbbbbbb' },
];

const docs: DocsPage[] = [
    { id: 'index', title: 'Docs', path: '', kind: 'page', corpus_path: 'index.md' },
    { id: 'pydeflate', title: 'pydeflate', path: 'tools/pydeflate', kind: 'external' },
];

const paths = sitemapPaths({ docs, gallery, sourceIds: ['dc/d/WorldBank_IDS'] });

const NOINDEX_PATHS = [
    '/s/abc',
    '/s/abc/download',
    '/embed/abc',
    '/studio',
    '/studio/abc',
    '/history',
    '/login',
    '/register',
];

test('every noindex route answers noindex, redirects and errors included', () => {
    for (const path of NOINDEX_PATHS) {
        assert.equal(robotsHeader(path), 'noindex, nofollow', path);
    }

    for (const path of ['/', '/data', '/docs', '/insights/gallery/a-card', '/sources']) {
        assert.equal(robotsHeader(path), undefined, path);
    }
});

test('crawlers may fetch the noindex routes and not the routes for programs', () => {
    for (const route of NOINDEX_ROUTES) {
        assert.equal(blocked(route), false, route);
    }

    for (const path of NOINDEX_PATHS.filter((path) => !path.endsWith('/download'))) {
        assert.equal(blocked(path), false, path);
    }

    for (const path of [
        '/mcp',
        '/api/v1/datasets',
        '/codes/not_found',
        '/openapi.json',
        '/s/abc/download',
        '/s/abc/download?part=2',
        '/s/abc/download/preparing',
    ]) {
        assert.equal(blocked(path), true, path);
    }

    assert.equal(robots().sitemap, 'https://developmentfinance.org/sitemap.xml');
});

test('a search share is indexed only when a gallery item opens it', () => {
    assert.equal(dataPageRobots({}, gallery), undefined);
    assert.equal(dataPageRobots({ share: 'bbbbbbbb' }, gallery), undefined);
    assert.deepEqual(dataPageRobots({ share: 'cccccccc' }, gallery), {
        index: false,
        follow: false,
    });
    // A card's share opens on /s/, never on /data.
    assert.deepEqual(dataPageRobots({ share: 'aaaaaaaa' }, gallery), {
        index: false,
        follow: false,
    });
    assert.deepEqual(dataPageRobots({ spec: 'x', share: 'bbbbbbbb' }, gallery), {
        index: false,
        follow: false,
    });
});

test('the sitemap lists docs, gallery and source pages, but no redirect', () => {
    assert.ok(paths.includes('/docs'));
    assert.ok(paths.includes('/docs/tools/pydeflate'));
    assert.ok(paths.includes('/insights/gallery/a-card'));
    assert.ok(paths.includes('/data?share=bbbbbbbb'));
    assert.ok(paths.includes('/data/sources/dc/d/WorldBank_IDS'));
    assert.equal(paths.includes('/insights/gallery/a-search'), false);
});

test('every page the sitemap lists may be fetched and indexed', () => {
    assert.ok(paths.length > 0);

    for (const path of paths) {
        const url = new URL(path, 'https://example.org');

        assert.equal(blocked(path), false, path);
        assert.equal(robotsHeader(url.pathname), undefined, path);

        if (url.pathname === '/data') {
            const query = Object.fromEntries(url.searchParams);

            assert.equal(dataPageRobots(query, gallery), undefined, path);
        }
    }
});
