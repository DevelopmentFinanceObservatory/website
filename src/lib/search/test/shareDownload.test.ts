import assert from 'node:assert/strict';
import test from 'node:test';

import type { SearchShareRef } from '../searchShare';
import {
    acceptsHtml,
    createWaitGate,
    MAX_UPSTREAM_WAITS,
    parsePreparingQuery,
    preparingDownloadPath,
    renderedFile,
    selectShareDownload,
    serveLiveDownload,
    shareDownloadLinks,
    shareDownloadText,
    sharedSnapshotFile,
    type ShareDownload,
} from '../shareDownload.ts';

const ref = (
    partIndex: number,
    specId: string,
    contentVersion: string | null = null,
    artifactDigest: string | null = null,
) =>
    ({
        partIndex,
        variableText: `variable ${partIndex}`,
        specId,
        identity: {},
        operations: [],
        contentVersion,
        artifactDigest,
    }) satisfies SearchShareRef;

const CSV_BUNDLE = { format: 'csv', bundle: true };

const select = (mode: 'live' | 'snapshot', refs: SearchShareRef[], query = '') =>
    selectShareDownload({
        share: { id: 'abc', mode, refs },
        query: new URLSearchParams(query),
    });

const live = (refs: SearchShareRef[], query = '') => select('live', refs, query);

test('a single-dataset share needs no part, even when two parts fold onto it', () => {
    for (const refs of [[ref(0, 'spec_a1')], [ref(0, 'spec_a1'), ref(1, 'spec_a1')]]) {
        assert.deepEqual(live(refs), {
            kind: 'live',
            specId: 'spec_a1',
            rendering: CSV_BUNDLE,
            path: '/api/datasets/spec_a1?format=csv&bundle=true',
        });
    }
});

test('a share of several datasets refuses a missing part with the link to each', () => {
    const outcome = live([ref(0, 'spec_a1'), ref(1, 'spec_b2')]);

    assert.equal(outcome.kind, 'refused');
    assert.equal(outcome.kind === 'refused' && outcome.status, 400);
    assert.match(
        outcome.kind === 'refused' ? outcome.message : '',
        /\n\/s\/abc\/download\?part=0 .*variable 0\n\/s\/abc\/download\?part=1 .*variable 1$/,
    );
    assert.equal(live([ref(0, 'spec_a1'), ref(1, 'spec_b2')], 'part=1').kind, 'live');
});

test('a part the share does not hold is not found, and a malformed one is refused', () => {
    const refs = [ref(0, 'spec_a1'), ref(1, 'spec_b2')];

    assert.equal(statusOf(live(refs, 'part=2')), 404);
    assert.equal(statusOf(live(refs, 'part=one')), 400);
    assert.equal(statusOf(live([], '')), 404);
});

test('a snapshot link reads the stored version and refuses format or bundle', () => {
    const refs = [ref(0, 'spec_a1', 'cv_9f', 'sha256:kept')];

    assert.deepEqual(select('snapshot', refs), {
        kind: 'snapshot',
        specId: 'spec_a1',
        contentVersion: 'cv_9f',
        artifactDigest: 'sha256:kept',
        path: '/api/datasets/spec_a1/cv_9f',
    });

    for (const query of ['format=csv', 'bundle=true', 'bundle=false&format=xlsx']) {
        assert.equal(statusOf(select('snapshot', refs, query)), 400, query);
    }

    assert.equal(statusOf(select('snapshot', [ref(0, 'spec_a1')])), 404);
});

test('a live link passes the chosen format and bundle to the definition door', () => {
    assert.deepEqual(live([ref(0, 'spec_a1')], 'bundle=false&format=xlsx'), {
        kind: 'live',
        specId: 'spec_a1',
        rendering: { format: 'xlsx', bundle: false },
        path: '/api/datasets/spec_a1?format=xlsx&bundle=false',
    });
});

test('a live link refuses a format or bundle value the door does not take', () => {
    for (const query of ['format=json', 'format=', 'bundle=yes']) {
        assert.equal(statusOf(live([ref(0, 'spec_a1')], query)), 400, query);
    }
});

test('one dataset gets the bare download link, several get one link per part', () => {
    assert.deepEqual(shareDownloadLinks('abc', [ref(0, 'spec_a1'), ref(1, 'spec_a1')]), [
        { path: '/s/abc/download', ref: null },
    ]);
    assert.deepEqual(shareDownloadLinks('abc', []), [{ path: '/s/abc/download', ref: null }]);

    const refs = [ref(0, 'spec_a1'), ref(2, 'spec_b2')];

    assert.deepEqual(shareDownloadLinks('abc', refs), [
        { path: '/s/abc/download?part=0', ref: refs[0] },
        { path: '/s/abc/download?part=2', ref: refs[1] },
    ]);
});

// On Cloud Run the request's origin is the container's bind address, so a
// link built from it leads nowhere. Every link the route prints is a path.
test('the route links to the share, its parts and the preparing page by path alone', () => {
    const refusal = live([ref(0, 'spec_a1'), ref(1, 'spec_b2')]);
    const links = [
        ...(refusal.kind === 'refused' ? refusal.message : '').matchAll(/^\/\S*/gm),
        ...shareDownloadText('a/b', 'Gone.').matchAll(/\/\S*$/gm),
    ].map(([link]) => link);

    assert.deepEqual(links, ['/s/abc/download?part=0', '/s/abc/download?part=1', '/s/a%2Fb']);
    assert.equal(
        preparingDownloadPath('abc', 'op_1f', CSV_BUNDLE),
        '/s/abc/download/preparing?op=op_1f&format=csv&bundle=true',
    );

    for (const text of [
        refusal.kind === 'refused' ? refusal.message : '',
        shareDownloadText('abc', 'Gone.'),
    ]) {
        assert.doesNotMatch(text, /:\/\//);
    }
});

function statusOf(outcome: ReturnType<typeof selectShareDownload>): number | null {
    return outcome.kind === 'refused' ? outcome.status : null;
}

// A version manifest lists every rendering stored for the version: here an
// xlsx bundle and a column-enriched CSV bundle ahead of the plain CSV bundle.
const versionFiles = [
    { artifact_digest: 'sha256:stats', url: 'u-stats', rendering: { statistics: 'series' } },
    { artifact_digest: 'sha256:xlsx', url: 'u-xlsx', rendering: { format: 'xlsx', bundle: true } },
    {
        artifact_digest: 'sha256:cols',
        url: 'u-cols',
        rendering: { format: 'csv', bundle: true, columns: ['country_income'] },
    },
    { artifact_digest: 'sha256:csv', url: 'u-csv', rendering: CSV_BUNDLE },
    { artifact_digest: 'sha256:file', url: 'u-file', rendering: { format: 'csv', bundle: false } },
];

test('a snapshot link serves the file its capture pinned, by digest', () => {
    const manifest = { artifacts: versionFiles };

    assert.deepEqual(sharedSnapshotFile(manifest, 'sha256:cols'), {
        url: 'u-cols',
        digest: 'sha256:cols',
    });
    assert.deepEqual(sharedSnapshotFile(manifest, 'sha256:xlsx')?.url, 'u-xlsx');
    assert.equal(sharedSnapshotFile(manifest, 'sha256:gone'), null);
});

test('a snapshot stored without a digest serves the plain CSV bundle its capture minted', () => {
    assert.deepEqual(sharedSnapshotFile({ artifacts: versionFiles }, null), {
        url: 'u-csv',
        digest: 'sha256:csv',
    });
    assert.equal(sharedSnapshotFile({ artifacts: versionFiles.slice(0, 3) }, null), null);
});

test('a finished operation serves the rendering asked for, not the first bundle listed', () => {
    const manifest = { artifacts: versionFiles };

    assert.deepEqual(renderedFile(manifest, CSV_BUNDLE), { url: 'u-csv', digest: 'sha256:csv' });
    assert.deepEqual(renderedFile(manifest, { format: 'csv', bundle: false }), {
        url: 'u-file',
        digest: 'sha256:file',
    });
    assert.equal(renderedFile(manifest, { format: 'parquet', bundle: true }), null);
});

test('the preparing page reads its operation and rendering, and refuses a malformed one', () => {
    const parse = (query: string) => parsePreparingQuery(new URLSearchParams(query));

    assert.deepEqual(parse('op=op_1f&format=xlsx&bundle=false'), {
        operationId: 'op_1f',
        rendering: { format: 'xlsx', bundle: false },
    });
    assert.deepEqual(parse('op=op_1f')?.rendering, CSV_BUNDLE);

    for (const query of ['op=op_XY', 'format=csv', 'op=op_1f&format=json', 'op=op_1f&bundle=1']) {
        assert.equal(parse(query), null, query);
    }
});

test('a request is a browser when its Accept lists text/html', () => {
    assert.equal(acceptsHtml('text/html,application/xhtml+xml,*/*;q=0.8'), true);
    assert.equal(acceptsHtml('application/xhtml+xml, Text/HTML;q=0.9'), true);

    for (const accept of [null, '*/*', 'text/csv', 'text/html;q=0', 'application/json']) {
        assert.equal(acceptsHtml(accept), false, String(accept));
    }
});

test('the wait gate refuses past its cap and frees a slot once released', () => {
    const gate = createWaitGate(MAX_UPSTREAM_WAITS);
    const held = Array.from({ length: MAX_UPSTREAM_WAITS }, () => gate.tryEnter());

    assert.ok(held.every((release) => release !== null));
    assert.equal(gate.tryEnter(), null);

    held[0]!();
    held[0]!();

    assert.notEqual(gate.tryEnter(), null);
    assert.equal(gate.tryEnter(), null);
});

const liveTarget = (rendering = CSV_BUNDLE) =>
    live([ref(0, 'spec_a1')], `format=${rendering.format}&bundle=${rendering.bundle}`) as Extract<
        ShareDownload,
        { kind: 'live' }
    >;

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const submitted = {
    operation: {
        operation_id: 'op_1f',
        status: 'pending',
        poll: '/api/datasets/operations/op_1f',
        retry_after_ms: 1000,
    },
};

// A Datasets API double: the definition door answers 202, and the
// operations door answers `pending` polls before the done manifest.
const asyncApi = ({ pending = 1 } = {}) => {
    const urls: string[] = [];
    let polls = 0;
    const fetchImpl = (async (url: string) => {
        urls.push(url);

        if (url.startsWith('https://api/api/datasets/operations/')) {
            polls += 1;

            return polls > pending
                ? json(200, {
                      operation: { operation_id: 'op_1f', status: 'done' },
                      manifest: {
                          content_version: 'cv_9f',
                          definition: { spec_id: 'spec_a1' },
                          artifacts: versionFiles,
                      },
                  })
                : json(200, {
                      operation: { operation_id: 'op_1f', status: 'running', poll: 'ignored' },
                  });
        }

        return json(202, submitted);
    }) as typeof fetch;

    return { urls, fetchImpl };
};

const serveLive = ({
    fetchImpl,
    html = false,
    gate = createWaitGate(MAX_UPSTREAM_WAITS),
    rendering = CSV_BUNDLE,
    waitMs,
    now,
}: {
    fetchImpl: typeof fetch;
    html?: boolean;
    gate?: ReturnType<typeof createWaitGate>;
    rendering?: { format: string; bundle: boolean };
    waitMs?: number;
    now?: () => number;
}) => {
    const pinned: (string | null)[] = [];
    const answer = serveLiveDownload({
        shareId: 'abc',
        target: liveTarget(rendering),
        html,
        base: 'https://api',
        gate,
        pin: async ({ digest }) => {
            pinned.push(digest);
        },
        fetchImpl,
        sleep: async () => {},
        ...(waitMs ? { waitMs } : {}),
        ...(now ? { now } : {}),
    });

    return { answer, pinned };
};

test('a code client waits on the operation, then gets the file asked for, pinned', async () => {
    const { urls, fetchImpl } = asyncApi({ pending: 2 });
    const { answer, pinned } = serveLive({
        fetchImpl,
        rendering: { format: 'csv', bundle: false },
    });

    assert.deepEqual(await answer, { kind: 'redirect', status: 302, location: 'u-file' });
    assert.deepEqual(pinned, ['sha256:file']);
    assert.deepEqual(urls, [
        'https://api/api/datasets/spec_a1?format=csv&bundle=false',
        ...Array(3).fill('https://api/api/datasets/operations/op_1f'),
    ]);
});

test('a browser is sent to the preparing page, which carries the rendering', async () => {
    const { urls, fetchImpl } = asyncApi();
    const { answer, pinned } = serveLive({ fetchImpl, html: true });

    assert.deepEqual(await answer, {
        kind: 'redirect',
        status: 303,
        location: '/s/abc/download/preparing?op=op_1f&format=csv&bundle=true',
    });
    assert.deepEqual(pinned, []);
    assert.equal(urls.length, 1);
});

test('a code client still waiting at the deadline gets 503 with Retry-After', async () => {
    const { fetchImpl } = asyncApi({ pending: Infinity });
    let clock = 0;
    const { answer, pinned } = serveLive({
        fetchImpl,
        waitMs: 5_000,
        now: () => (clock += 1_000),
    });
    const outcome = await answer;

    assert.equal(outcome.kind === 'reply' && outcome.status, 503);
    assert.equal(outcome.kind === 'reply' && outcome.retryAfter, '60');
    assert.deepEqual(pinned, []);
});

test('a full gate answers 503 at once, and a finished wait frees its slot', async () => {
    const gate = createWaitGate(1);
    let answerDoor!: () => void;
    const doorAnswered = new Promise<void>((resolve) => {
        answerDoor = resolve;
    });
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
        urls.push(url);
        await doorAnswered;

        return json(200, { artifacts: [versionFiles[3]] });
    }) as typeof fetch;

    const first = serveLive({ fetchImpl, gate });
    const refused = await serveLive({ fetchImpl, gate }).answer;

    assert.equal(refused.kind === 'reply' && refused.status, 503);
    assert.equal(refused.kind === 'reply' && refused.retryAfter, '30');
    assert.equal(urls.length, 1);

    answerDoor();

    assert.deepEqual(await first.answer, { kind: 'redirect', status: 302, location: 'u-csv' });
    assert.equal((await serveLive({ fetchImpl, gate }).answer).kind, 'redirect');
});

test('a client that disconnects mid-poll ends its wait quietly and frees its slot', async (t) => {
    const errors = t.mock.method(console, 'error', () => {});
    const gate = createWaitGate(1);
    const client = new AbortController();
    const pinned: (string | null)[] = [];
    let polls = 0;
    const fetchImpl = (async (url: string) => {
        if (!url.includes('/operations/')) {
            return json(202, submitted);
        }

        polls += 1;
        client.abort();

        return json(200, { operation: { operation_id: 'op_1f', status: 'running' } });
    }) as typeof fetch;

    const answer = await serveLiveDownload({
        shareId: 'abc',
        target: liveTarget(),
        html: false,
        base: 'https://api',
        gate,
        pin: async ({ digest }) => {
            pinned.push(digest);
        },
        signal: client.signal,
        fetchImpl,
        sleep: async () => {},
    });

    assert.equal(answer.kind === 'reply' && answer.status, 499);
    assert.equal(polls, 1);
    assert.deepEqual(pinned, []);
    assert.equal(errors.mock.callCount(), 0);
    assert.notEqual(gate.tryEnter(), null);
});
