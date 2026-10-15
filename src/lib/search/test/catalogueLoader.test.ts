/**
 * `catalogueLoader.ts`: a 200 catalogue is cached for five minutes under its
 * path. Any other answer is not cached, and the loader itself holds off for
 * a minute before it reads again.
 */
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

// Before catalogueLoader.ts, which loads next/cache.
import { nextCache } from '../../test/nextCacheStub.ts';
import { loadSearchCatalogue } from '../catalogueLoader.ts';

import { wholeCatalogueBody } from './fixtures/catalogue-bodies.ts';

process.env.SEARCH_API_BASE = 'https://apis.example.org';

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

beforeEach(nextCache.clear);

test('a 200 catalogue is read once, no-store, and cached for five minutes', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => json(wholeCatalogueBody));

    assert.deepEqual(await loadSearchCatalogue(), wholeCatalogueBody);
    assert.deepEqual(await loadSearchCatalogue(), wholeCatalogueBody);

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(
        String(fetchMock.mock.calls[0]!.arguments[0]),
        'https://apis.example.org/api/search/catalogue',
    );
    assert.equal((fetchMock.mock.calls[0]!.arguments[1] as RequestInit).cache, 'no-store');
    assert.deepEqual(
        [...nextCache.stored.values()].map((entry) => entry.revalidate),
        [300],
    );
});

for (const [label, answer] of [
    ['a 503', async () => json({ code: 'busy' }, 503)],
    ['a 404', async () => json({ code: 'not_found' }, 404)],
    [
        'a failed request',
        async (): Promise<Response> => {
            throw new TypeError('fetch failed');
        },
    ],
] as const) {
    test(`after ${label} nothing is cached and the next read waits a minute`, async (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
        t.mock.method(console, 'warn', () => {});

        let failing = true;
        const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
            failing ? answer() : json(wholeCatalogueBody),
        );

        assert.equal(await loadSearchCatalogue(), null);
        assert.equal(nextCache.stored.size, 0);

        t.mock.timers.tick(59_999);
        assert.equal(await loadSearchCatalogue(), null);
        assert.equal(fetchMock.mock.callCount(), 1);

        failing = false;
        t.mock.timers.tick(1);
        assert.deepEqual(await loadSearchCatalogue(), wholeCatalogueBody);
        assert.equal(fetchMock.mock.callCount(), 2);
        assert.equal(nextCache.stored.size, 1);
    });
}
