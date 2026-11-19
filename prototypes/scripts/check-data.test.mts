import assert from 'node:assert/strict';
import test from 'node:test';

import { pinnedVersions, problems } from './check-data-rules.mts';

const provenance = {
    sdk: 'development-finance==0.4.1',
    query: 'demo pinned reads',
    retrieved: '2026-11-19T09:30:00.000Z',
};
const member = { content_version: 'cv_a', artifact: { digest: 'sha256:aa' } };
const ref = { format_version: 1, members: [member] };
const entry = {
    ref,
    provenance: { members: [{ content_version: 'cv_a', pinned: true }] },
};
const codes = (found: { code: string }[]) => found.map((item) => item.code);

test('a plain envelope passes under any file name', () => {
    assert.deepEqual(problems({ provenance, data: [] }, 'series.json'), []);
});

test('envelope fields each fail with their own code', () => {
    assert.deepEqual(codes(problems(null)), ['not_object']);
    assert.deepEqual(codes(problems({ provenance })), ['no_data']);
    assert.deepEqual(codes(problems({ data: [] })), ['no_provenance']);
    assert.deepEqual(
        codes(problems({ provenance: { sdk: 'x', query: ' ', retrieved: 'today' }, data: [] })),
        ['sdk_invalid', 'query_invalid', 'retrieved_invalid'],
    );
});

test('refs.json passes with a ref and pinned provenance members under each key', () => {
    assert.deepEqual(problems({ provenance, data: { aid: entry } }, 'refs.json'), []);
});

test('refs.json fails an entry without ref or provenance', () => {
    const data = { aid: { ref }, debt: { provenance: {} }, empty: 'x' };

    assert.deepEqual(codes(problems({ provenance, data }, 'refs.json')), [
        'provenance_invalid',
        'ref_invalid',
        'provenance_no_members',
        'ref_invalid',
        'provenance_invalid',
    ]);
});

test('refs.json fails a ref with no members', () => {
    const data = { aid: { ...entry, ref: { format_version: 1, members: [] } } };

    assert.deepEqual(codes(problems({ provenance, data }, 'refs.json')), ['ref_no_members']);
});

test('refs.json fails provenance with no members', () => {
    const data = { aid: { ref, provenance: { members: [] } } };

    assert.deepEqual(codes(problems({ provenance, data }, 'refs.json')), ['provenance_no_members']);
});

test('refs.json fails a provenance member that is not pinned', () => {
    const data = {
        aid: { ref, provenance: { members: [{ content_version: 'cv_a', pinned: false }] } },
    };

    assert.deepEqual(codes(problems({ provenance, data }, 'refs.json')), [
        'provenance_member_unpinned',
    ]);
});

test('refs.json fails an empty or non-object data', () => {
    assert.deepEqual(codes(problems({ provenance, data: {} }, 'refs.json')), ['data_not_map']);
    assert.deepEqual(codes(problems({ provenance, data: [] }, 'refs.json')), ['data_not_map']);
});

test('pinnedVersions lists only pinned members', () => {
    const data = {
        a: { provenance: { members: [{ content_version: 'cv_a', pinned: true }] } },
        b: { provenance: { members: [{ content_version: 'cv_b', pinned: false }] } },
    };

    assert.deepEqual([...pinnedVersions(data)], ['cv_a']);
});

test('live-refs.json passes when every member version is pinned in refs.json', () => {
    const pinned = pinnedVersions({ aid: entry });

    assert.deepEqual(problems({ provenance, data: { plhiv: ref } }, 'live-refs.json', pinned), []);
});

test('live-refs.json fails a bare value, an empty ref and an unpinned version', () => {
    const pinned = pinnedVersions({ aid: entry });
    const other = { format_version: 1, members: [{ content_version: 'cv_z' }] };
    const found = problems(
        {
            provenance,
            data: { bare: { ref }, empty: { format_version: 1 }, moved: other },
        },
        'live-refs.json',
        pinned,
    );

    assert.deepEqual(codes(found), ['ref_invalid', 'ref_no_members', 'live_member_unpinned']);
});

test('refs files still need the envelope provenance', () => {
    const found = problems(
        { provenance: { ...provenance, retrieved: 'today' }, data: { a: ref } },
        'live-refs.json',
        pinnedVersions({ aid: entry }),
    );

    assert.deepEqual(codes(found), ['retrieved_invalid']);
});
