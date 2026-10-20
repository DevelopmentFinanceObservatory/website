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

test('codeTarget: a code cannot leave the /codes segment', () => {
    const target = new URL(codeTarget('https://api.example', '../openapi.json', ''));

    assert.equal(target.pathname, '/codes/..%2Fopenapi.json');
});
