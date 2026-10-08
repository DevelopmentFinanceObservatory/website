/**
 * `cardDownload.ts`: what a card's Download Data offers, the URLs it and the
 * proxy call, and how a file or a refusal comes back. The export route is
 * stubbed with the headers and refusal bodies dfo-apis serves for
 * `GET /api/presentation/components/{id}/revisions/{rev}/data`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChartWidget, TextWidget } from '../../chat/widgets.ts';
import {
    CardDownloadError,
    cardDataUrl,
    cardDownloadMessage,
    DOWNLOAD_PENDING,
    cardRefOf,
    componentDataTarget,
    fetchCardData,
} from '../cardDownload.ts';

const REF = { component_id: 'cmp_9f8e', revision: 3 };

const chart = (spec_id: string): ChartWidget => ({
    kind: 'chart',
    id: 'cmp_9f8e',
    chartType: 'line',
    title: 'ODA to Kenya',
    categories: ['2022', '2023'],
    series: [{ label: 'Kenya', values: [1, 2] }],
    ref: REF,
    frame: { spec_id, content_version: 'cv_1' },
});

test('cardRefOf: a card with a revision exports it, spec_ or ops_ frame alike', () => {
    for (const specId of ['spec_19e7', 'ops_1a2b']) {
        assert.deepEqual(cardRefOf(chart(specId)), REF);
    }
});

test('cardRefOf: a text card, or a card saved without a revision, has none', () => {
    const text: TextWidget = { kind: 'text', id: 't1', title: 'Note', body: '' };
    const unsaved = { ...chart('spec_19e7'), ref: undefined, frame: undefined };

    assert.equal(cardRefOf(text), null);
    assert.equal(cardRefOf(unsaved), null);
});

test('cardDataUrl: names the revision in the path and the file in the query', () => {
    assert.equal(
        cardDataUrl(REF, { format: 'xlsx', bundle: false }),
        '/api/presentation/components/cmp_9f8e/revisions/3/data?format=xlsx&bundle=false',
    );
});

test('componentDataTarget: the proxy forwards to the export route with the query as sent', () => {
    assert.equal(
        componentDataTarget('https://apis.example', 'cmp_9f8e', '3', '?format=csv&bundle=true'),
        'https://apis.example/api/presentation/components/cmp_9f8e/revisions/3/data?format=csv&bundle=true',
    );
    assert.equal(
        componentDataTarget('https://apis.example', 'cmp/../x', '3', ''),
        'https://apis.example/api/presentation/components/cmp%2F..%2Fx/revisions/3/data',
    );
});

test('fetchCardData: names the file as Content-Disposition does', async (t) => {
    const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(new Uint8Array([80, 75, 3, 4]), {
                headers: {
                    'content-type': 'application/zip',
                    'content-disposition': 'attachment; filename="cmp_9f8e.r3.zip"',
                },
            }),
    );

    const { blob, fileName } = await fetchCardData(REF, { format: 'csv', bundle: true });
    const [url] = fetchMock.mock.calls[0]!.arguments as [string];

    assert.equal(
        url,
        '/api/presentation/components/cmp_9f8e/revisions/3/data?format=csv&bundle=true',
    );
    assert.equal(fileName, 'cmp_9f8e.r3.zip');
    assert.equal(blob.type, 'application/zip');
    assert.equal(blob.size, 4);
});

test('fetchCardData: without Content-Disposition the file is named for the revision', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('series,value\n'));

    const { fileName } = await fetchCardData(REF, { format: 'parquet', bundle: false });

    assert.equal(fileName, 'cmp_9f8e.r3.parquet');
});

for (const [status, code] of [
    [404, 'not_found'],
    [404, 'frame_unavailable'],
    [400, 'request_invalid'],
    [500, 'internal_error'],
] as const) {
    test(`fetchCardData: a ${status} ${code} refusal throws with its code`, async (t) => {
        t.mock.method(
            globalThis,
            'fetch',
            async () => new Response(JSON.stringify({ code, detail: 'refused' }), { status }),
        );

        await assert.rejects(
            fetchCardData(REF, { format: 'csv', bundle: true }),
            (error: unknown) => error instanceof CardDownloadError && error.code === code,
        );
    });
}

test('cardDownloadMessage: an xlsx refusal points to CSV or Parquet, not a retry', () => {
    const message = cardDownloadMessage('request_invalid');

    assert.notEqual(message, cardDownloadMessage(null));
    assert.match(message, /CSV/);
    assert.match(message, /Parquet/);
});

test('fetchCardData: a refusal without a JSON body throws with no code', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('Bad gateway', { status: 502 }));

    await assert.rejects(
        fetchCardData(REF, { format: 'csv', bundle: true }),
        (error: unknown) => error instanceof CardDownloadError && error.code === null,
    );
});

const LIVE = { shareId: 'shr 1', cardId: 'cmp_9f8e' };

test('fetchCardData: a live card asks its share for the rows, any other card the export route', async (t) => {
    const asked: string[] = [];

    t.mock.method(globalThis, 'fetch', async (url: string) => {
        asked.push(url);

        return new Response('rows');
    });

    await fetchCardData(REF, { format: 'parquet', bundle: false }, { live: LIVE });
    await fetchCardData(REF, { format: 'parquet', bundle: false });

    assert.deepEqual(asked, [
        '/api/share/shr%201/cards/cmp_9f8e/data?format=parquet&bundle=false',
        '/api/presentation/components/cmp_9f8e/revisions/3/data?format=parquet&bundle=false',
    ]);
});

// The share route's answers that are not a file: none may be saved as one.
for (const [name, response, code, retryAfterS] of [
    [
        'a refresh in progress, the wait in Retry-After',
        () =>
            new Response(JSON.stringify({ status: 'pending', retry_after_s: 6 }), {
                status: 503,
                headers: { 'retry-after': '7' },
            }),
        DOWNLOAD_PENDING,
        7,
    ],
    [
        'a refresh in progress, the wait in the body alone',
        () => new Response(JSON.stringify({ status: 'pending', retry_after_s: 6 }), { status: 503 }),
        DOWNLOAD_PENDING,
        6,
    ],
    [
        'a refusal of the format',
        () =>
            new Response(JSON.stringify({ status: 'error', code: 'request_invalid' }), {
                status: 400,
            }),
        'request_invalid',
        null,
    ],
    [
        'a back end out of reach',
        () =>
            new Response(JSON.stringify({ status: 'error', code: 'backend_unreachable' }), {
                status: 502,
            }),
        'backend_unreachable',
        null,
    ],
    [
        'a share that no longer holds the card',
        () => new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }),
        'not_found',
        null,
    ],
] as const) {
    test(`fetchCardData: a live card meeting ${name} throws ${code}`, async (t) => {
        t.mock.method(globalThis, 'fetch', async () => response());

        await assert.rejects(
            fetchCardData(REF, { format: 'csv', bundle: true }, { live: LIVE }),
            (error: unknown) =>
                error instanceof CardDownloadError &&
                error.code === code &&
                error.retryAfterS === retryAfterS,
        );
    });
}

test('fetchCardData: off a live share, a 503 or an `error` key is not read as the share route', async (t) => {
    t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(JSON.stringify({ status: 'pending', error: 'not_found' }), {
                status: 503,
                headers: { 'retry-after': '7' },
            }),
    );

    await assert.rejects(
        fetchCardData(REF, { format: 'csv', bundle: true }),
        (error: unknown) =>
            error instanceof CardDownloadError && error.code === null && error.retryAfterS === null,
    );
});

test('cardDownloadMessage: a stalled export and a switched-off site each say what happened', () => {
    const messages = ['backend_timeout', 'live_unavailable', 'unauthorized', 'refresh_not_configured']
        .map((code) => cardDownloadMessage(code));

    assert.ok(messages.every((message) => message !== cardDownloadMessage(null)));
    assert.match(messages[0]!, /took too long/);
    assert.equal(new Set(messages.slice(1)).size, 1);
});

test('cardDownloadMessage: a refresh in progress names the wait, and is not the generic failure', () => {
    assert.match(cardDownloadMessage(DOWNLOAD_PENDING, 7), /\b7 seconds\b/);
    assert.notEqual(cardDownloadMessage(DOWNLOAD_PENDING), cardDownloadMessage(null));
});
