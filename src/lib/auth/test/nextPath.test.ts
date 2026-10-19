/**
 * `nextPath.ts`: the post-sign-in target is a path on this site. Every form
 * a browser would resolve to another host falls back to /studio.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { safeNext } from '../nextPath.ts';

const cases: [label: string, input: string | undefined, expected: string][] = [
    ['protocol-relative', '//evil.example', '/studio'],
    ['backslash host', '/\\evil.example/x', '/studio'],
    ['tab before the host slash', '/\t/evil.example', '/studio'],
    ['newline before the host slash', '/\n/evil.example', '/studio'],
    ['absolute URL', 'https://evil.example', '/studio'],
    ['javascript scheme', 'javascript:alert(1)', '/studio'],
    ['undefined', undefined, '/studio'],
    ['empty', '', '/studio'],
    ['studio', '/studio', '/studio'],
    ['query and hash', '/history?tab=1#top', '/history?tab=1#top'],
    ['nested path', '/studio/c/abc', '/studio/c/abc'],
];

for (const [label, input, expected] of cases) {
    test(`safeNext: ${label}`, () => {
        assert.equal(safeNext(input), expected);
    });
}
