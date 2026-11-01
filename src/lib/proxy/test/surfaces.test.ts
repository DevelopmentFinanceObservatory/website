/**
 * `surfaces.ts`: SEARCH_API_SURFACES names exactly the /api/v1/<surface>
 * route directories that forward to SEARCH_API_BASE, so /openapi.json
 * (openapi.ts) publishes what the site proxies and nothing else.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { forwardablePath, isForwardablePath, SEARCH_API_SURFACES } from '../surfaces.ts';

const V1 = fileURLToPath(new URL('../../../app/api/v1', import.meta.url));

// Every route handler under /api/v1 that forwards to SEARCH_API_BASE, with
// its surface: its directory below /api/v1 less the dynamic segments.
const apisRoutes = readdirSync(V1, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('route.ts'))
    .map((file) => ({
        surface: dirname(file)
            .split(sep)
            .filter((segment) => segment !== '.' && !segment.startsWith('['))
            .join('/'),
        source: readFileSync(join(V1, file), 'utf8'),
    }))
    .filter(({ source }) => source.includes('searchApiBase()'));

test('SEARCH_API_SURFACES: lists every /api/v1 surface that forwards to SEARCH_API_BASE', () => {
    const surfaces = new Set(apisRoutes.map(({ surface }) => surface));

    assert.deepEqual([...surfaces].sort(), [...SEARCH_API_SURFACES].sort());
});

test("SEARCH_API_SURFACES: each surface's routes forward to its own dfo-apis path", () => {
    assert.ok(apisRoutes.length >= SEARCH_API_SURFACES.length);

    for (const { surface, source } of apisRoutes) {
        assert.ok(source.includes(`\${searchApiBase()}/api/${surface}`), surface);
    }
});

test('isForwardablePath: a decoded segment that would climb out of its surface is refused', () => {
    for (const path of [['..'], ['.'], ['Ab3dEf7h', '..', '..', 'skills'], ['a/b'], ['a\\b']]) {
        assert.equal(isForwardablePath(path), false, JSON.stringify(path));
    }

    for (const path of [
        [],
        ['Ab3dEf7h', 'slots', '1', 'data'],
        ['cmp_a', 'revisions', '2'],
        ['..a'],
    ]) {
        assert.equal(isForwardablePath(path), true, JSON.stringify(path));
    }
});

test('forwardablePath: encodes each decoded segment so it stays one segment below its surface', () => {
    const upstream = (segments: string[]) =>
        new URL(`https://apis.test/api/datasets${forwardablePath(segments) ?? ''}`);

    // /api/v1/datasets/%252e%252e/skills/x reaches the route as `%2e%2e`,
    // which fetch would read as `..` if spliced in raw.
    assert.equal(upstream(['%2e%2e', 'skills', 'x']).pathname, '/api/datasets/%252e%252e/skills/x');

    for (const segment of ['spec?admin=1', 'spec#frag']) {
        const url = upstream([segment, 'cv_1']);

        assert.equal(url.search, '', segment);
        assert.equal(url.hash, '', segment);
        assert.equal(url.pathname.split('/').length, 5, segment);
    }

    assert.equal(forwardablePath([]), '');
    assert.equal(forwardablePath(['..', 'skills']), undefined);
});

// Next.js resolves the `@/` imports of a route, so `node --test` cannot load
// one; the guard is held to the routes by their source. Every route under
// /api that forwards (calls forward() or builds a target on SEARCH_API_BASE)
// is found by globbing. One with a dynamic segment builds its upstream path
// with forwardablePath, refuses dot segments with isForwardablePath before an
// encoding target builder, or admits only the exact names studioRoute lists;
// none splices its segments in raw.
const API = fileURLToPath(new URL('../../../app/api', import.meta.url));

const forwardingRoutes = readdirSync(API, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('route.ts'))
    .map((file) => ({ file, source: readFileSync(join(API, file), 'utf8') }))
    .filter(({ source }) => /\bforward\(|\$\{searchApiBase\(\)\}|SEARCH_API_BASE\}/.test(source));

test('every forwarding route with a dynamic segment refuses or encodes it before forwarding', () => {
    const dynamic = forwardingRoutes.filter(({ file }) => file.includes('['));

    assert.ok(dynamic.length >= SEARCH_API_SURFACES.length + 2);

    for (const { file, source } of dynamic) {
        assert.match(
            source,
            /\bforwardablePath\(|\bisForwardablePath\(\[[^\]]+\]\)|studioRoute\(/,
            file,
        );
        assert.doesNotMatch(source, /\.join\(['"]\/['"]\)|\$\{(path|id|revision)\}/, file);
    }
});
