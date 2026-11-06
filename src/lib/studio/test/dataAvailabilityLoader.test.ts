/**
 * `dataAvailabilityLoader.ts`: the overview joins the search catalogue's
 * counts and the graph's sources. A failed graph read leaves the sources
 * null, is remembered for a minute, and concurrent callers share one read.
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

const WORLD_BANK = { id: 'dc/s/WorldBank', label: 'World Bank', count: 1 };

const pathOf = (input: RequestInfo | URL): string => new URL(String(input)).pathname;

const isCatalogue = (input: RequestInfo | URL) => pathOf(input) === '/api/search/catalogue';

// The loader remembers a failed graph read across tests. The clock starts
// far enough ahead of any earlier test's failure for that memory to have
// lapsed, and each test moves it on from there.
let now = 1_800_000_000_000;

beforeEach(() => {
    now += 120_000;
});

test('the overview holds the catalogue counts and the graph sources', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now });
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) =>
        isCatalogue(input) ? json(wholeCatalogueBody) : json(SOURCES_BODY),
    );

    assert.deepEqual(await loadDataAvailability(), {
        counts: wholeCatalogueBody.counts,
        sources: [WORLD_BANK],
    });
});

test('a failed graph read leaves the sources null, keeps the counts and is remembered', async (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
    const warn = t.mock.method(console, 'warn', () => {});

    let graphReads = 0;
    const fetchMock = t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
        if (isCatalogue(input)) {
            return json(wholeCatalogueBody);
        }

        graphReads += 1;

        return graphReads <= 2 ? json({ code: 'busy' }, 503) : json(SOURCES_BODY);
    });

    // The graph read retries one 503 after a second, then gives up.
    const first = loadDataAvailability();

    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(1000);

    assert.deepEqual(await first, { counts: wholeCatalogueBody.counts, sources: null });
    assert.equal(graphReads, 2);
    assert.equal(warn.mock.callCount(), 1);

    // Within the minute the graph is not read again.
    t.mock.timers.tick(30_000);
    assert.deepEqual(await loadDataAvailability(), {
        counts: wholeCatalogueBody.counts,
        sources: null,
    });
    assert.equal(graphReads, 2);

    // After it, the read goes out and its answer is served.
    t.mock.timers.tick(31_000);
    assert.deepEqual(await loadDataAvailability(), {
        counts: wholeCatalogueBody.counts,
        sources: [WORLD_BANK],
    });
    assert.equal(graphReads, 3);
    assert.ok(fetchMock.mock.callCount() >= 3);
});

test('callers that arrive during one graph read share it', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now });

    let graphReads = 0;
    let answer: ((res: Response) => void) | undefined;
    t.mock.method(globalThis, 'fetch', (input: RequestInfo | URL) => {
        if (isCatalogue(input)) {
            return Promise.resolve(json(wholeCatalogueBody));
        }

        graphReads += 1;

        return new Promise<Response>((resolve) => {
            answer = resolve;
        });
    });

    const first = loadDataAvailability();
    const second = loadDataAvailability();

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(graphReads, 1);
    answer!(json(SOURCES_BODY));

    const expected = { counts: wholeCatalogueBody.counts, sources: [WORLD_BANK] };

    assert.deepEqual(await first, expected);
    assert.deepEqual(await second, expected);
    assert.equal(graphReads, 1);
});
