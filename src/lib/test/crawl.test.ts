/**
 * What a crawler is told: robots.txt keeps it off the routes for programs
 * only, so it can read the `noindex` on the routes that carry one, and the
 * sitemap lists pages it may fetch and index.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match.js';
import { searchParamsToUrlQuery } from 'next/dist/shared/lib/router/utils/querystring.js';

import robots from '../../app/robots.ts';
import {
    dataPageMetadata,
    dataPageNoindex,
    dataPageQuery,
    dataPageRobots,
    NOINDEX_ROUTES,
    noindexHeaders,
} from '../crawl.ts';
import type { DocsPage } from '../docs/corpus.ts';
import { pageOpenGraph, SITE_CARD, SITE_NAME } from '../site.ts';
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

const docs: DocsPage[] = [
    { id: 'index', title: 'Docs', path: '', kind: 'page', corpus_path: 'index.md' },
    { id: 'pydeflate', title: 'pydeflate', path: 'tools/pydeflate', kind: 'external' },
];

const paths = sitemapPaths({
    docs,
    sourceIds: ['dc/d/WorldBank_IDS'],
    librarySlugs: ['health-oda'],
});

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

    for (const path of ['/', '/data', '/docs', '/about/publications', '/sources']) {
        assert.equal(robotsHeader(path), undefined, path);
    }
});

test('/data says noindex in its headers exactly where its metadata does', () => {
    for (const search of [
        '',
        'share=bbbbbbbb',
        'share=cccccccc',
        'share=aaaaaaaa',
        'share=',
        'spec=',
        'spec=x',
        'spec=x&share=bbbbbbbb',
        'share=bbbbbbbb&share=bbbbbbbb',
        'share=cccccccc&share=bbbbbbbb',
        'q=aid+to+Ghana',
    ]) {
        const params = new URLSearchParams(search);
        // The page's searchParams, as Next builds them from the URL.
        const query = searchParamsToUrlQuery(params);

        assert.deepEqual(dataPageQuery(params), query, search);
        assert.equal(dataPageNoindex(params), !!dataPageRobots(query), search);
    }

    assert.equal(dataPageNoindex(new URLSearchParams('share=')), true);
    assert.equal(dataPageNoindex(new URLSearchParams('share=bbbbbbbb')), true);
    assert.equal(dataPageNoindex(new URLSearchParams('q=aid+to+Ghana')), false);
});

test('a page that names itself keeps the site name and shows the site card', () => {
    assert.deepEqual(pageOpenGraph({ title: 'About', description: 'Who we are.' }), {
        type: 'article',
        siteName: SITE_NAME,
        title: 'About',
        description: 'Who we are.',
        images: SITE_CARD,
    });
    assert.equal('images' in pageOpenGraph({ title: 'A', description: 'B', image: null }), false);
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

test('version links and search shares are unlisted, and every other render is listed', () => {
    const unlisted = { index: false, follow: false };

    assert.equal(dataPageRobots({}), undefined);
    assert.equal(dataPageRobots({ q: 'aid to Ghana' }), undefined);
    assert.deepEqual(dataPageRobots({ share: 'bbbbbbbb' }), unlisted);
    assert.deepEqual(dataPageRobots({ spec: 'x' }), unlisted);
});

test('every render of /data is the Data page, robots-marked per URL', () => {
    const unlisted = { index: false, follow: false };
    const data = dataPageMetadata({});

    assert.equal(data.title, 'Data — DFO');
    assert.ok(data.description);
    assert.equal(data.openGraph?.title, 'Data');
    assert.equal(data.robots, undefined);

    for (const query of [{ share: 'bbbbbbbb' }, { spec: 'x', share: 'bbbbbbbb' }]) {
        assert.deepEqual(dataPageMetadata(query), { ...data, robots: unlisted });
    }
});

test('the sitemap lists docs, About and source pages', () => {
    assert.ok(paths.includes('/docs'));
    assert.ok(paths.includes('/docs/tools/pydeflate'));
    assert.ok(paths.includes('/about/publications'));
    assert.ok(paths.includes('/data/sources/dc/d/WorldBank_IDS'));
    assert.ok(paths.includes('/library/health-oda'));
});

test('every page the sitemap lists may be fetched and indexed', () => {
    assert.ok(paths.length > 0);

    for (const path of paths) {
        const url = new URL(path, 'https://example.org');

        assert.equal(blocked(path), false, path);
        assert.equal(robotsHeader(url.pathname), undefined, path);

        if (url.pathname === '/data') {
            assert.equal(dataPageNoindex(url.searchParams), false, path);
        }
    }
});
