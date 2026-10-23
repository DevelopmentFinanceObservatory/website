/**
 * `codes.ts`: the upstream address a `/codes/{code}` request forwards to.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { codeTarget } from '../codes.ts';

test('codeTarget: puts the code at the API root, keeping the query', () => {
    assert.equal(
        codeTarget('https://api.example', 'request_invalid', '?lang=fr'),
        'https://api.example/codes/request_invalid?lang=fr',
    );
});

for (const code of ['..', '.', '../openapi.json', 'request_invalid/..', 'Request_Invalid', '']) {
    test(`codeTarget: no address for ${JSON.stringify(code)}, which no code can be`, () => {
        assert.equal(codeTarget('https://api.example', code, '?q'), null);
    });
}
