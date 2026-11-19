import assert from 'node:assert/strict';
import test from 'node:test';

import { API_ORIGIN, readErrorCode } from './readError.ts';

test("readErrorCode shows the client's code, or the error's name and the API", () => {
    const failed = Object.assign(new Error('x'), { code: 'network_error' });

    assert.equal(readErrorCode(failed), 'network_error');
    assert.equal(readErrorCode(new TypeError('Failed to fetch')), `TypeError from ${API_ORIGIN}`);
    assert.equal(
        readErrorCode(Object.assign(new Error('x'), { code: null })),
        `Error from ${API_ORIGIN}`,
    );
});
