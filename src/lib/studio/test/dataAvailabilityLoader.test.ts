/**
 * `dataAvailabilityLoader.ts`: the overview joins the search catalogue's
 * counts and the graph's publishers; a failed or slow graph read leaves the
 * publishers null and the counts stay.
 */
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

// Before the loader, whose reads load next/cache.
import { nextCache } from '../../test/nextCacheStub.ts';
import { loadDataAvailability } from '../dataAvailabilityLoader.ts';

import { wholeCatalogueBody } from '../../search/test/fixtures/catalogue-bodies.ts';

process.env.SEARCH_API_BASE = 'https://apis.example.org';

beforeEach(nextCache.clear);

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const SOURCES_BODY = {
    sources: [
        {
            source: { ref: 'dc/s/WorldBank', label: 'World Bank' },
            data_commons: { id: 'dfo', label: 'Development Finance Observatory' },
            datasets: [
                {
                    ref: 'dc/d/IDS',
                    label: 'International Debt Statistics',
                    description: null,
                    license_type: null,
                    update_cadence: null,
                    years_covered: null,
                    source_url: null,
                    provenances: [],
                },
            ],
            exclusions: [],
        },
    ],
};

const pathOf = (input: RequestInfo | URL): string => new URL(String(input)).pathname;

test('the overview holds the catalogue counts and the graph publishers', async (t) => {
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) =>
        pathOf(input) === '/api/search/catalogue' ? json(wholeCatalogueBody) : json(SOURCES_BODY),
    );

    assert.deepEqual(await loadDataAvailability(), {
        counts: wholeCatalogueBody.counts,
        publishers: [{ id: 'dc/s/WorldBank', label: 'World Bank', count: 1 }],
    });
});

test('a failed graph read leaves the publishers null and keeps the counts', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) =>
        pathOf(input) === '/api/search/catalogue'
            ? json(wholeCatalogueBody)
            : json({ code: 'busy' }, 500),
    );

    assert.deepEqual(await loadDataAvailability(), {
        counts: wholeCatalogueBody.counts,
        publishers: null,
    });
    assert.equal(warn.mock.callCount(), 1);
});

test('a graph read that outlasts the wait leaves the publishers null', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(globalThis, 'fetch', (input: RequestInfo | URL) =>
        pathOf(input) === '/api/search/catalogue'
            ? Promise.resolve(json(wholeCatalogueBody))
            : new Promise<Response>(() => {}),
    );

    const loading = loadDataAvailability();

    // Let the catalogue read settle before the wait runs out.
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(3000);

    assert.deepEqual(await loading, { counts: wholeCatalogueBody.counts, publishers: null });
});
