import assert from 'node:assert/strict';
import test from 'node:test';

import { SharesError } from '../apisShares.ts';
import { sharesRefusal } from '../shareRefusal.ts';

test("dfo-apis' refusals of a create become the site's own codes", async () => {
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
        [new SharesError('request_invalid', { status: 400 }), 502, 'transient_unavailable', false],
    ];

    for (const [error, status, code, retryable] of rows) {
        const response = sharesRefusal(error);
        const body = await response.json();

        assert.equal(response.status, status, error.code);
        assert.equal(body.code, code, error.code);
        assert.equal(body.retryable, retryable, error.code);
    }
});
