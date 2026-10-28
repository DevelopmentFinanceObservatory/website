import assert from 'node:assert/strict';
import test from 'node:test';

import { bindSnapshotParts, frozenRefSpecId, unreadableSpecIds } from '../frozenObservations.ts';
import {
    captureSnapshot,
    parseDownloadPin,
    PIN_REFUSED,
    PIN_UNAVAILABLE,
    pinVersionFrame,
    renderingArtifact,
} from '../snapshot.ts';
import { artifact } from './fixtures/dataset-documents.ts';

// The manifest lists a statistics artifact, a Parquet frame, a
// column-enriched CSV bundle, then the plain CSV bundle a mint without
// options renders. A capture pins the plain CSV bundle; a version pin takes
// whichever the manifest lists first.
const artifacts: { artifact_digest: string; url: string; rendering: object }[] = [
    { artifact_digest: 'sha256:stats', url: 'u1', rendering: { statistics: 'series' } },
    { artifact_digest: 'sha256:frame', url: 'u2', rendering: { format: 'parquet', bundle: false } },
    {
        artifact_digest: 'sha256:cols',
        url: 'u3',
        rendering: { format: 'csv', bundle: true, columns: ['country_income'] },
    },
    { artifact_digest: 'sha256:csv', url: 'u4', rendering: { format: 'csv', bundle: true } },
];

type Call = { url: string; headers: Record<string, string>; body: unknown };

// A Datasets API double: the mint answers a manifest with `listed`, the
// pin answers `pinStatus`. Records every request.
const datasetsApi = (pinStatus: number, listed = artifacts) => {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
        calls.push({
            url,
            headers: init.headers as Record<string, string>,
            body: JSON.parse(String(init.body)),
        });
        const isPin = url.endsWith('/pin');
        const status = isPin ? pinStatus : 200;
        const body = isPin
            ? status === 200
                ? {}
                : { code: 'refused', detail: `refused with ${status}` }
            : {
                  content_version: 'cv_abc',
                  definition: { spec_id: 'spec_crs' },
                  artifacts: listed,
              };

        return { ok: status < 300, status, json: async () => body } as Response;
    }) as typeof fetch;

    return { calls, fetchImpl };
};

const capture = (fetchImpl: typeof fetch, principal: string | undefined) =>
    captureSnapshot({
        base: 'https://api',
        specId: 'spec_crs',
        definition: { spec_id: 'spec_crs' },
        principal,
        pollDeadlineMs: 1_000,
        fetchImpl,
    });

test('captureSnapshot pins the plain CSV bundle, with the principal, and returns its digest', async () => {
    const { calls, fetchImpl } = datasetsApi(200);

    assert.deepEqual(await capture(fetchImpl, 'site'), {
        specId: 'spec_crs',
        contentVersion: 'cv_abc',
        artifactDigest: 'sha256:csv',
    });
    assert.deepEqual(
        calls.map((call) => call.url),
        ['https://api/api/datasets', 'https://api/api/datasets/spec_crs/cv_abc/pin'],
    );
    assert.equal(calls[0]!.headers['x-dfo-principal'], undefined);
    assert.equal(calls[1]!.headers['x-dfo-principal'], 'site');
    assert.deepEqual(calls[1]!.body, { schema_version: 1, artifact_digest: 'sha256:csv' });
});

test('captureSnapshot mints with the default options', async () => {
    const { calls, fetchImpl } = datasetsApi(200);

    await capture(fetchImpl, 'site');

    assert.equal('options' in (calls[0]!.body as object), false);
});

// Each listed rendering sets one MintOptions member beyond format and bundle, so it is a different
// file from the plain one listed after it. A false or null member sets nothing.
for (const [name, listed, asked, plain] of [
    ['columns', { columns: ['country_income'] }, { format: 'csv', bundle: true }, false],
    ['pivot', { pivot: { index: ['year'] } }, { format: 'csv', bundle: true }, false],
    ['groupby', { groupby: { by: ['stat_var'] } }, { format: 'csv', bundle: true }, false],
    ['layout', { layout: 'frame' }, { format: 'parquet', bundle: false }, false],
    [
        'without_party_totals',
        { without_party_totals: true },
        { format: 'csv', bundle: true },
        false,
    ],
    [
        'a false without_party_totals',
        { without_party_totals: false },
        { format: 'csv', bundle: true },
        true,
    ],
    ['a null layout', { layout: null }, { format: 'parquet', bundle: false }, true],
] as const) {
    test(`renderingArtifact ${plain ? 'takes' : 'skips'} a rendering with ${name}`, () => {
        const withMember = artifact({
            artifact_digest: 'sha256:member',
            rendering: { ...asked, ...listed },
        });
        const bare = artifact({ artifact_digest: 'sha256:plain', rendering: { ...asked } });

        assert.equal(
            renderingArtifact([withMember, bare], asked)?.artifact_digest,
            plain ? 'sha256:member' : 'sha256:plain',
        );
    });
}

test('captureSnapshot fails when the mint lists no plain CSV bundle', async () => {
    for (const listed of [[], artifacts.slice(0, 3)]) {
        const { calls, fetchImpl } = datasetsApi(200, listed);

        await assert.rejects(capture(fetchImpl, 'site'), { message: PIN_REFUSED });
        assert.equal(calls.length, 1);
    }
});

test('captureSnapshot fails when the pin is refused', async () => {
    const { fetchImpl } = datasetsApi(403);

    await assert.rejects(capture(fetchImpl, 'site'), { message: PIN_REFUSED });
});

for (const status of [429, 503]) {
    test(`captureSnapshot reports a pin refused with ${status} as unavailable`, async () => {
        const { fetchImpl } = datasetsApi(status);

        await assert.rejects(capture(fetchImpl, 'site'), {
            message: PIN_UNAVAILABLE,
            cause: new Error(`refused with ${status}`),
        });
    });
}

test('captureSnapshot fails before minting when no principal is configured', async () => {
    const { calls, fetchImpl } = datasetsApi(200);

    await assert.rejects(capture(fetchImpl, undefined), { message: PIN_REFUSED });
    assert.equal(calls.length, 0);
});

const part = (specId: string, status = 'definite') => ({
    status,
    ...(status === 'definite' && { spec: { spec_id: specId } }),
});

test('a replay that returns another spec_id still binds the ref it answers', () => {
    const bindings = bindSnapshotParts(
        [{ specId: 'spec_stored_a' }, { specId: 'spec_stored_b' }, { specId: 'spec_stored_c' }],
        { parts: [part('spec_replayed_a'), part('spec_x', 'no_data'), part('spec_stored_c')] },
    );

    assert.equal(frozenRefSpecId(bindings, 0, 'spec_replayed_a'), 'spec_stored_a');
    assert.equal(frozenRefSpecId(bindings, 1, 'spec_x'), null);
    assert.equal(frozenRefSpecId(bindings, 2, 'spec_stored_c'), 'spec_stored_c');
    // An edit that moves the part to another spec_id drops the frozen rows.
    assert.equal(frozenRefSpecId(bindings, 0, 'spec_edited'), null);
    // The stored id alone does not reach the rows when the replay changed it.
    assert.equal(frozenRefSpecId(bindings, 0, 'spec_stored_a'), null);
});

test('a replay with a different part count leaves every part unreadable', () => {
    const bindings = bindSnapshotParts([{ specId: 'spec_a' }, { specId: 'spec_b' }], {
        parts: [part('spec_a'), part('spec_x', 'no_data'), part('spec_c')],
    });

    assert.equal(frozenRefSpecId(bindings, 0, 'spec_a'), null);
    assert.equal(frozenRefSpecId(bindings, 2, 'spec_c'), null);
    assert.deepEqual([...unreadableSpecIds(bindings, new Set())], ['spec_a', 'spec_c']);
});

test('an unreadable ref names the spec_id its part shows', () => {
    const bindings = bindSnapshotParts([{ specId: 'spec_a' }, { specId: 'spec_b' }], {
        parts: [part('spec_a2'), part('spec_b2')],
    });

    assert.deepEqual([...unreadableSpecIds(bindings, new Set(['spec_b']))], ['spec_b2']);
    assert.deepEqual([...unreadableSpecIds([], new Set(['spec_b']))], ['spec_b']);
});

const manifest = (listed: typeof artifacts) => ({
    content_version: 'cv_abc',
    definition: { spec_id: 'spec_crs' },
    artifacts: listed,
});

// A Datasets API double for the version pin: the version read answers
// `versionArtifacts` (or `versionStatus`), the mint answers `mintVersion`'s
// manifest, and every pin answers 200. Records every request.
const frameApi = ({
    versionArtifacts = [] as typeof artifacts,
    versionStatus = 200,
    mintVersion = 'cv_abc',
} = {}) => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
        const method = init.method ?? 'GET';

        calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : null });

        const [status, body] =
            method === 'GET'
                ? [versionStatus, manifest(versionArtifacts)]
                : url.endsWith('/pin')
                  ? [200, {}]
                  : [200, { ...manifest(artifacts), content_version: mintVersion }];

        return { ok: status < 300, status, json: async () => body } as Response;
    }) as typeof fetch;

    return { calls, fetchImpl };
};

const pinFrame = (fetchImpl: typeof fetch) =>
    pinVersionFrame({
        base: 'https://api',
        specId: 'spec_crs',
        contentVersion: 'cv_abc',
        definition: { spec_id: 'spec_crs' },
        principal: 'site',
        pollDeadlineMs: 1_000,
        fetchImpl,
    });

const pinnedDigests = (calls: { url: string; body: unknown }[]) =>
    calls
        .filter((call) => call.url.endsWith('/pin'))
        .map((call) => (call.body as { artifact_digest: string }).artifact_digest);

test('pinVersionFrame pins the first listed artifact and no other', async () => {
    const bundle = {
        artifact_digest: 'sha256:bundle',
        url: 'u4',
        rendering: { format: 'csv', bundle: true },
    };
    const { calls, fetchImpl } = frameApi({ versionArtifacts: [bundle, ...artifacts] });

    assert.equal(await pinFrame(fetchImpl), 'pinned');
    assert.deepEqual(pinnedDigests(calls), ['sha256:bundle']);
    assert.ok(calls.every((call) => call.url !== 'https://api/api/datasets'));
});

test('pinVersionFrame pins an already pinned artifact again, which repairs its reference', async () => {
    const pinned = artifacts.map((artifact) => ({ ...artifact, tier: 'pinned' }));
    const { calls, fetchImpl } = frameApi({ versionArtifacts: pinned });

    assert.equal(await pinFrame(fetchImpl), 'already_pinned');
    assert.deepEqual(pinnedDigests(calls), ['sha256:stats']);
});

test('pinVersionFrame mints a version that lists no artifact with the download inputs and pins it', async () => {
    const { calls, fetchImpl } = frameApi();

    assert.equal(await pinFrame(fetchImpl), 'minted');
    assert.deepEqual(pinnedDigests(calls), ['sha256:csv']);
    assert.deepEqual(calls.find((call) => call.url === 'https://api/api/datasets')?.body, {
        schema_version: 1,
        input: {
            kind: 'spec_id',
            spec_id: 'spec_crs',
            definition: { spec_id: 'spec_crs' },
        },
    });
});

test('pinVersionFrame pins nothing when the mint lands on a newer version', async () => {
    const { calls, fetchImpl } = frameApi({ mintVersion: 'cv_new' });

    await assert.rejects(pinFrame(fetchImpl), { message: 'snapshot_version_moved' });
    assert.deepEqual(pinnedDigests(calls), []);
});

test('pinVersionFrame refuses a version the API no longer serves', async () => {
    const { calls, fetchImpl } = frameApi({ versionStatus: 410 });

    await assert.rejects(pinFrame(fetchImpl), { message: 'version 410' });
    assert.equal(calls.length, 1);
});

test('pinVersionFrame sends the spec and version as one path segment each', async () => {
    const { calls, fetchImpl } = frameApi({ versionArtifacts: artifacts });

    await pinVersionFrame({
        base: 'https://api',
        specId: 'spec_a/../b?c#d',
        contentVersion: 'cv_%2e.',
        definition: {},
        principal: 'site',
        pollDeadlineMs: 1_000,
        fetchImpl,
    });
    assert.deepEqual(
        calls.map(({ method, url }) => `${method} ${url}`),
        [
            'GET https://api/api/datasets/spec_a%2F..%2Fb%3Fc%23d/cv_%252e.',
            'POST https://api/api/datasets/spec_a%2F..%2Fb%3Fc%23d/cv_%252e./pin',
        ],
    );
});

const pinBody = (fields: Record<string, unknown>) =>
    JSON.stringify({ specId: 'spec_crs', contentVersion: 'cv_abc', ...fields });

test('parseDownloadPin reads a download-pin body', () => {
    assert.deepEqual(parseDownloadPin(pinBody({ definition: { a: 1 } })), {
        specId: 'spec_crs',
        contentVersion: 'cv_abc',
        definition: { a: 1 },
    });
    assert.deepEqual(parseDownloadPin(pinBody({})), {
        specId: 'spec_crs',
        contentVersion: 'cv_abc',
        definition: null,
    });
});

for (const [name, text] of [
    ['a non-JSON body', 'nope'],
    ['a malformed spec', pinBody({ specId: '../x' })],
    ...['/', '.', '%', '?', '#'].flatMap((mark) => [
        [`a spec holding "${mark}"`, pinBody({ specId: `spec_a${mark}b` })],
        [`a version holding "${mark}"`, pinBody({ contentVersion: `cv_a${mark}b` })],
    ]),
    ['a definition that is not an object', pinBody({ definition: 'x' })],
] as const) {
    test(`parseDownloadPin refuses ${name}`, () => {
        assert.equal(parseDownloadPin(text), null);
    });
}
