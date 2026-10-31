import assert from 'node:assert/strict';
import test from 'node:test';

import { SharesError } from '../apisShares.ts';
import { sharesReadFailure, sharesRefusal } from '../shareRefusal.ts';

test("refusals of a create become the site's own codes", async () => {
    const rows: [SharesError, number, string, boolean][] = [
        [new SharesError('payload_too_large', { status: 413 }), 413, 'payload_too_large', false],
        [
            new SharesError('allowance_exhausted', { status: 429, retryable: true }),
            429,
            'share_limit',
            true,
        ],
        [
            new SharesError('service_unavailable', { status: 503, retryable: true }),
            502,
            'transient_unavailable',
            true,
        ],
        [new SharesError('backend_unreachable'), 502, 'transient_unavailable', true],
        [new SharesError('request_invalid', { status: 400 }), 422, 'share_refused', false],
        [new SharesError('frame_unavailable', { status: 404 }), 422, 'share_refused', false],
        [new SharesError('internal_error', { status: 500 }), 502, 'share_refused', false],
        [new SharesError('account_deleting', { status: 409 }), 403, 'account_deleting', false],
    ];

    for (const [error, status, code, retryable] of rows) {
        const response = sharesRefusal(error);
        const body = await response.json();

        assert.equal(response.status, status, error.code);
        assert.equal(body.code, code, error.code);
        assert.equal(body.retryable, retryable, error.code);
        assert.equal(body.upstream_code, code === 'share_refused' ? error.code : undefined);
    }
});

test("a failed share read answers dfo-apis' code and whether to ask again", async () => {
    const rows: [SharesError, boolean][] = [
        [new SharesError('service_unavailable', { status: 503, retryable: true }), true],
        [new SharesError('backend_timeout'), true],
        [new SharesError('backend_refused', { status: 500 }), false],
    ];

    for (const [error, retryable] of rows) {
        const response = sharesReadFailure(error);
        const body = await response.json();

        assert.equal(response.status, 502, error.code);
        assert.equal(response.headers.get('content-type'), 'application/problem+json');
        assert.equal(body.code, error.code);
        assert.equal(body.retryable, retryable, error.code);
    }
});
