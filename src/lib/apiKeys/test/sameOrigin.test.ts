/**
 * The account key routes' CSRF check: a mutating request is refused unless
 * its `Origin` names the host it was sent to.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import test from 'node:test';

const { isSameOrigin, refuseCrossOrigin } = await import('../sameOrigin.ts');

const SITE = 'https://developmentfinance.org';

const headers = (init: Record<string, string>) => new Headers(init);

test('isSameOrigin accepts only an Origin that names the request host', () => {
    const cases: [string, Record<string, string>, boolean][] = [
        ['same host', { origin: SITE, host: 'developmentfinance.org' }, true],
        ['same host and port', { origin: 'http://localhost:3000', host: 'localhost:3000' }, true],
        [
            'forwarded host wins over the internal host',
            {
                origin: SITE,
                host: 'web.internal:8080',
                'x-forwarded-host': 'developmentfinance.org',
            },
            true,
        ],
        [
            'first of several forwarded hosts',
            {
                origin: SITE,
                host: 'web.internal',
                'x-forwarded-host': 'developmentfinance.org, lb',
            },
            true,
        ],
        ['no Origin', { host: 'developmentfinance.org' }, false],
        ['opaque Origin', { origin: 'null', host: 'developmentfinance.org' }, false],
        [
            'foreign Origin',
            { origin: 'https://evil.example', host: 'developmentfinance.org' },
            false,
        ],
        ['different port', { origin: 'http://localhost:4000', host: 'localhost:3000' }, false],
        [
            'foreign Origin with a matching internal host',
            {
                origin: 'https://evil.example',
                host: 'evil.example',
                'x-forwarded-host': 'developmentfinance.org',
            },
            false,
        ],
        ['no host at all', { origin: SITE }, false],
    ];

    for (const [name, init, expected] of cases) {
        assert.equal(isSameOrigin(headers(init)), expected, name);
    }
});

test('refuseCrossOrigin answers a 403 problem that is not cached, and null for a same-origin call', async () => {
    const foreign = new Request('https://developmentfinance.org/api/account/api-keys', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
    });
    const refusal = refuseCrossOrigin(foreign);

    assert.ok(refusal);
    assert.equal(refusal.status, 403);
    assert.equal(refusal.headers.get('cache-control'), 'no-store');
    assert.equal(refusal.headers.get('content-type'), 'application/problem+json');
    assert.equal(((await refusal.json()) as { code: string }).code, 'cross_origin');

    const own = new Request('https://developmentfinance.org/api/account/api-keys', {
        method: 'POST',
        headers: { origin: SITE, host: 'developmentfinance.org' },
    });

    assert.equal(refuseCrossOrigin(own), null);
});
