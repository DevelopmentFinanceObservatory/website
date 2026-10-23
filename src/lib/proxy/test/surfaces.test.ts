/**
 * `surfaces.ts`: SEARCH_API_SURFACES names exactly the /api/v1/<surface>
 * route directories that forward to SEARCH_API_BASE, so /openapi.json
 * (openapi.ts) publishes what the site proxies and nothing else.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { SEARCH_API_SURFACES } from '../surfaces.ts';

const V1 = fileURLToPath(new URL('../../../app/api/v1', import.meta.url));

// The source of every route handler under `dir`.
const routeSources = (dir: string): string[] =>
    readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('route.ts'))
        .map((file) => readFileSync(join(dir, file), 'utf8'));

test('SEARCH_API_SURFACES: lists every /api/v1 surface that forwards to SEARCH_API_BASE', () => {
    const forwarding = readdirSync(V1).filter((surface) =>
        routeSources(join(V1, surface)).some((source) => source.includes('searchApiBase()')),
    );

    assert.deepEqual(forwarding.sort(), [...SEARCH_API_SURFACES].sort());
});

test("SEARCH_API_SURFACES: each surface's routes forward to its own dfo-apis path", () => {
    for (const surface of SEARCH_API_SURFACES) {
        const sources = routeSources(join(V1, surface));

        assert.ok(sources.length > 0, surface);

        for (const source of sources) {
            assert.ok(source.includes(`\${searchApiBase()}/api/${surface}`), surface);
        }
    }
});
