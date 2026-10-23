import assert from 'node:assert/strict';
import test from 'node:test';

import {
    outcomeFromDocument,
    parseVersionLink,
    storedDownload,
    versionLinkHref,
    type VersionLinkOutcome,
} from '../versionLink.ts';

const params = (query: string) => new URLSearchParams(query);

test('parseVersionLink reads a version link and a latest-data link', () => {
    assert.deepEqual(parseVersionLink(params('spec=spec_24e7ab&v=cv_5c9dfd')), {
        specId: 'spec_24e7ab',
        contentVersion: 'cv_5c9dfd',
    });
    assert.deepEqual(parseVersionLink(params('spec=spec_24e7ab')), {
        specId: 'spec_24e7ab',
        contentVersion: null,
    });
});

for (const query of [
    'q=aid',
    'spec=col_3e9084&v=cv_5c9dfd',
    'spec=spec_24e7ab&v=op_1',
    'spec=../x',
]) {
    test(`parseVersionLink refuses ${query}`, () => {
        assert.equal(parseVersionLink(params(query)), null);
    });
}

test('versionLinkHref round-trips through parseVersionLink', () => {
    for (const link of [
        { specId: 'spec_a1', contentVersion: 'cv_b2' },
        { specId: 'spec_a1', contentVersion: null },
    ]) {
        const href = versionLinkHref(link);

        assert.deepEqual(parseVersionLink(new URL(href, 'https://site').searchParams), link);
    }
});

const identity = { identity_version: 'spec1', shape: { kind: 'statvar_schema' } };

const sharedOf = (outcome: VersionLinkOutcome | null) =>
    outcome?.kind === 'opened' ? outcome.shared : null;

test('outcomeFromDocument opens a version as a snapshot share dated by its earliest artifact', () => {
    const link = { specId: 'spec_a1', contentVersion: 'cv_b2' };
    const outcome = outcomeFromDocument(link, {
        definition: { spec_id: 'spec_a1', identity },
        citation: { sources: [{ label: 'OECD CRS' }, { label: 'IMF WEO' }] },
        artifacts: [
            { created_at: '2026-10-03T12:00:00Z' },
            { created_at: '2026-10-02T09:00:00Z' },
            {},
        ],
    });

    assert.deepEqual(outcome, {
        kind: 'opened',
        shared: {
            id: 'spec_a1',
            mode: 'snapshot',
            query: '',
            createdAt: '2026-10-02T09:00:00Z',
            refs: [
                {
                    partIndex: 0,
                    variableText: 'OECD CRS, IMF WEO',
                    specId: 'spec_a1',
                    identity,
                    entityGroups: null,
                    operations: [],
                    assumptions: null,
                    contentVersion: 'cv_b2',
                },
            ],
            link,
        },
    });
});

test('outcomeFromDocument opens a latest-data link live', () => {
    const shared = sharedOf(
        outcomeFromDocument(
            { specId: 'spec_a1', contentVersion: null },
            {
                definition: { spec_id: 'spec_a1', identity },
            },
        ),
    );

    assert.equal(shared?.mode, 'live');
    assert.equal(shared?.refs[0]?.variableText, 'Dataset');
    assert.equal(shared?.refs[0]?.contentVersion, null);
});

test('outcomeFromDocument refuses a document without a definition identity', () => {
    const link = { specId: 'spec_a1', contentVersion: 'cv_b2' };

    assert.equal(outcomeFromDocument(link, { definition: { spec_id: 'spec_a1' } }), null);
    assert.equal(outcomeFromDocument(link, { definition: null }), null);
});

const pinned = { identity_version: 'spec1', shape: { kind: 'stat_var' } };
const stored = [
    { url: '/api/datasets/spec_a1/cv_b2/files/sha256:s0', rendering: { statistics: 'series' } },
    {
        url: '/api/datasets/spec_a1/cv_b2/files/sha256:f1',
        rendering: { format: 'csv', bundle: false },
    },
    {
        url: '/api/datasets/spec_a1/cv_b2/files/sha256:b1',
        artifact_digest: 'sha256:b1',
        rendering: { format: 'csv', bundle: true },
    },
];
const frame = {
    url: '/api/datasets/spec_a1/cv_b2/files/sha256:fr',
    artifact_digest: 'sha256:fr',
    media_type: 'application/vnd.apache.parquet',
    rendering: { format: 'frame' },
};

test('outcomeFromDocument offers a pinned-StatVar version as its stored bundle', () => {
    assert.deepEqual(
        outcomeFromDocument(
            { specId: 'spec_a1', contentVersion: 'cv_b2' },
            { definition: { spec_id: 'spec_a1', identity: pinned }, artifacts: stored },
        ),
        {
            kind: 'download_only',
            download: { href: '/api/version-download/spec_a1/cv_b2', format: 'zip' },
        },
    );
});

test('outcomeFromDocument offers a data file when a pinned-StatVar version has no bundle', () => {
    assert.deepEqual(
        outcomeFromDocument(
            { specId: 'spec_a1', contentVersion: 'cv_b2' },
            { definition: { spec_id: 'spec_a1', identity: pinned }, artifacts: stored.slice(0, 2) },
        ),
        {
            kind: 'download_only',
            download: { href: '/api/version-download/spec_a1/cv_b2', format: 'csv' },
        },
    );
});

for (const [name, link, artifacts] of [
    ['a latest-data link', { specId: 'spec_a1', contentVersion: null }, stored],
    [
        'a version with only statistics',
        { specId: 'spec_a1', contentVersion: 'cv_b2' },
        stored.slice(0, 1),
    ],
    [
        'a version with only the canonical frame and statistics',
        { specId: 'spec_a1', contentVersion: 'cv_b2' },
        [frame, stored[0]],
    ],
] as const) {
    test(`outcomeFromDocument offers no download for a pinned-StatVar ${name}`, () => {
        assert.deepEqual(
            outcomeFromDocument(link, {
                definition: { spec_id: 'spec_a1', identity: pinned },
                artifacts: [...artifacts],
            }),
            { kind: 'download_only', download: null },
        );
    });
}

test('storedDownload picks the bundle, else the first data file, by its stable link', () => {
    assert.deepEqual(storedDownload({ artifacts: stored }), {
        url: '/api/datasets/spec_a1/cv_b2/files/sha256:b1',
        format: 'zip',
        digest: 'sha256:b1',
    });
    assert.deepEqual(storedDownload({ artifacts: stored.slice(0, 2) }), {
        url: '/api/datasets/spec_a1/cv_b2/files/sha256:f1',
        format: 'csv',
        digest: null,
    });
    assert.equal(storedDownload({ artifacts: stored.slice(0, 1) }), null);
});

test('storedDownload skips the canonical frame', () => {
    assert.equal(storedDownload({ artifacts: [frame, stored[0]] }), null);
    assert.deepEqual(storedDownload({ artifacts: [stored[1], frame, stored[0]] }), {
        url: '/api/datasets/spec_a1/cv_b2/files/sha256:f1',
        format: 'csv',
        digest: null,
    });
});
