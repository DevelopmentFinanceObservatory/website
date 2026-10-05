import assert from 'node:assert/strict';
import test from 'node:test';

import { downloadFailureMessage } from '../downloadMessage.ts';
import { mintDataset } from '../searchClient.ts';

test('a 422 member_not_resolvable on download says the data has changed', async (t) => {
    t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(
                JSON.stringify({
                    code: 'member_not_resolvable',
                    detail: 'resolved set differs from the posted list',
                }),
                { status: 422, headers: { 'content-type': 'application/json' } },
            ),
    );

    const error = await mintDataset({ spec_id: 'spec-1', format: 'csv' }).catch((e) => e);

    assert.equal(
        downloadFailureMessage(error),
        'This data has changed since you searched. Search again to download it.',
    );
});

test('an unmapped refusal shows its own detail', () => {
    assert.equal(downloadFailureMessage(new Error('boom')), 'boom');
});
