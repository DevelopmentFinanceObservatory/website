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

import { SEARCH_API_SURFACES } from '../surfaces.ts';

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
