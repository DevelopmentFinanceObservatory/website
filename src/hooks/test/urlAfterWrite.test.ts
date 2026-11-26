import assert from 'node:assert/strict';
import { test } from 'node:test';

const { urlAfterWrite } = await import('../urlAfterWrite.ts');

const base = 'https://example.org/data/sources';

const cases: [string, string, string | null, string | null][] = [
    ['unchanged value with a %20 space', `${base}?q=a%20b`, 'a b', null],
    ['unchanged value with a + space', `${base}?q=a+b`, 'a b', null],
    ['absent param and null', base, null, null],
    ['empty param and null', `${base}?q=`, null, null],
    ['new value', base, 'x', `${base}?q=x`],
    ['changed value', `${base}?q=a`, 'b', `${base}?q=b`],
    ['dropped value', `${base}?q=a`, null, base],
];

for (const [name, href, serialized, expected] of cases) {
    test(`urlAfterWrite: ${name}`, () => {
        assert.equal(urlAfterWrite(href, 'q', serialized)?.href ?? null, expected);
    });
}
