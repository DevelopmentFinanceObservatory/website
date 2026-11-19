import assert from 'node:assert/strict';
import test from 'node:test';

import { problems } from './check-data-rules.mts';

const provenance = {
    sdk: 'development-finance==0.4.1',
    query: 'demo pinned reads',
    retrieved: '2026-11-19T09:30:00.000Z',
};
const ref = { format_version: 1, members: [] };

test('a plain envelope passes under any file name', () => {
    assert.deepEqual(problems({ provenance, data: [] }, 'series.json'), []);
});

test('refs.json passes with a ref and its provenance under each key', () => {
    const data = { aid: { ref, provenance: { sdk: 'development-finance==0.4.1' } } };

    assert.deepEqual(problems({ provenance, data }, 'refs.json'), []);
});

test('refs.json fails an entry without ref or provenance', () => {
    const data = { aid: { ref }, debt: { provenance: {} }, empty: 'x' };
    const found = problems({ provenance, data }, 'refs.json');

    assert.deepEqual(found, [
        "data.aid.provenance must be the dataset's provenance object",
        'data.debt.ref must be a ref object (with format_version)',
        'data.empty.ref must be a ref object (with format_version)',
        "data.empty.provenance must be the dataset's provenance object",
    ]);
});

test('refs.json fails an empty or non-object data', () => {
    assert.equal(problems({ provenance, data: {} }, 'refs.json').length, 1);
    assert.equal(problems({ provenance, data: [] }, 'refs.json').length, 1);
});

test('live-refs.json passes with a ref under each key and fails a bare value', () => {
    assert.deepEqual(problems({ provenance, data: { plhiv: ref } }, 'live-refs.json'), []);
    assert.deepEqual(problems({ provenance, data: { plhiv: { ref } } }, 'live-refs.json'), [
        'data.plhiv must be a ref object (with format_version)',
    ]);
});

test('refs files still need the envelope provenance', () => {
    const found = problems(
        { provenance: { ...provenance, retrieved: 'today' }, data: { a: ref } },
        'live-refs.json',
    );

    assert.equal(found.length, 1);
    assert.match(found[0] ?? '', /provenance\.retrieved/);
});
