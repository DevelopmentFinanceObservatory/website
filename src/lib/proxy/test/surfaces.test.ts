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

import { isForwardablePath, SEARCH_API_SURFACES } from '../surfaces.ts';

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

// Next.js resolves the `@/` imports of a route, so `node --test` cannot load
// one; the guard is held to the routes by their source. Every catch-all route
// under /api/v1 that forwards is found by globbing: it refuses an unsafe path
// with isForwardablePath, or admits only the exact names studioRoute lists.
const forwardingCatchAlls = readdirSync(V1, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('route.ts') && /\[\[?\.\.\.path\]\]?/.test(file))
    .map((file) => ({ file, source: readFileSync(join(V1, file), 'utf8') }))
    .filter(({ source }) => /\bforward\(/.test(source));

test('every forwarding catch-all under /api/v1 refuses an unsafe path before forwarding', () => {
    assert.ok(forwardingCatchAlls.length >= SEARCH_API_SURFACES.length);

    for (const { file, source } of forwardingCatchAlls) {
        assert.match(source, /isForwardablePath\(path\)|studioRoute\(/, file);
    }
});

test('the component export route refuses a dot id or revision before forwarding', () => {
    const route = 'presentation/components/[id]/revisions/[revision]/data/route.ts';
    const source = readFileSync(join(V1, '..', route), 'utf8');

    assert.match(source, /isForwardablePath\(\[id, revision\]\)/);
});
