import assert from 'node:assert/strict';
import test from 'node:test';

import {
    readShare,
    type CreateShareBody,
    type ShareRecord,
    type SharesBackend,
} from '../../chat/apisShares.ts';
import {
    liveCardsRefusal,
    LIVE_SHARE_MAX_DATA_CARDS,
    sharedViewOfRecord,
    slotDataResponse,
    slotOfQuery,
    slotRefreshResponse,
    type SlotDeps,
} from '../slotCards.ts';
import { APIS, componentRead, DATASET_FRAME, MOVED_FRAME } from './fixtures/live-backend-stub.ts';

type Call = { method: string; path: string; headers: Headers; signal?: AbortSignal | null };

const NOTE = { kind: 'text', id: 'n1', turn: 1, title: 'Mine', body: 'Words' };

const recordOf = (mode: 'live' | 'snapshot'): ShareRecord => ({
    id: 'Ab3dEf7h',
    kind: 'canvas',
    mode,
    title: 'Aid',
    slots: [{ slot: 1, card: { component_id: 'cmp_a', revision: 2, frame: DATASET_FRAME } }],
    payload: {
        id: 'conv-1',
        sessionId: null,
        componentRefs: [],
        title: 'Aid',
        updatedAt: 1,
        messages: [],
        turnCount: 1,
        pinnedIds: [],
        removedIds: [],
        layout: {},
        widgets: [
            { kind: 'chart', id: 'c1', turn: 1, chartType: 'line', slot: 0 },
            // A data card a live share holds with no slot.
            { kind: 'table', id: 'c2', turn: 1 },
            NOTE,
        ],
    },
    createdAt: '2026-10-28T10:00:00Z',
});

const shareBody = (record: ShareRecord) => ({
    id: record.id,
    kind: record.kind,
    mode: record.mode,
    title: record.title,
    revision: 1,
    slots: record.slots.map((slot) => ({
        ...slot,
        data_url: `https://dfo.example/api/v1/presentation/shares/${record.id}/slots/${slot.slot}/data`,
    })),
    payload: record.payload,
    created_at: record.createdAt,
});

// What dfo-apis holds for a share the SDK made (`{cards, latest}`, no
// payload): a card share with slot 1 filled, and slot 2 left empty by a
// replace.
const sdkRecordOf = (mode: 'live' | 'snapshot'): ShareRecord => ({
    id: 'Sd9kSh4r',
    kind: 'card',
    mode,
    title: null,
    slots: [
        { slot: 1, card: { component_id: 'cmp_a', revision: 2, frame: DATASET_FRAME } },
        { slot: 2, card: null },
    ],
    payload: null,
    createdAt: '2026-10-28T10:00:00Z',
});

const ETAG = '"slot-card-1"';

// dfo-apis' slot card: the revision's component read, drawn on `served`.
const slotCard = (served: typeof DATASET_FRAME) => {
    const body = componentRead('cmp_a', 2, DATASET_FRAME);

    body['resolved_payload'].provenance.inputs = [served];

    return { ...body, freshness: 'current', retention: null };
};

/** A dfo-apis holding `record`, whose slot 1 serves `served`. `slotReply`
 *  replaces its slot card answer, and `historyReply` its history page for
 *  the request's URL, which otherwise lists nothing. */
const depsOf = (
    record: ShareRecord,
    served = DATASET_FRAME,
    slotReply?: (call: Call) => Response | Promise<Response>,
    historyReply: (url: URL) => Response = () => Response.json({ id: record.id, served: [] }),
): { deps: SlotDeps; calls: Call[] } => {
    const calls: Call[] = [];
    const fetcher: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        const call = {
            method: init?.method ?? 'GET',
            path: `${url.pathname}${url.search}`,
            headers: new Headers(init?.headers),
            signal: init?.signal,
        };

        calls.push(call);

        if (url.pathname === `/api/presentation/shares/${record.id}`) {
            return Response.json(shareBody(record));
        }

        if (url.pathname === `/api/presentation/shares/${record.id}/history`) {
            return historyReply(url);
        }

        if (url.pathname === `/api/presentation/shares/${record.id}/slots/1`) {
            if (slotReply) {
                return slotReply(call);
            }

            const headers = { etag: ETAG, 'cache-control': 'no-cache' };

            return call.headers.get('if-none-match') === ETAG
                ? new Response(null, { status: 304, headers })
                : Response.json(slotCard(served), { headers });
        }

        if (url.pathname === '/api/presentation/components/cmp_a') {
            return Response.json(componentRead('cmp_a', 2, DATASET_FRAME));
        }

        if (url.pathname.endsWith('/data')) {
            return new Response('year,value\n2024,1\n', {
                headers: { 'content-type': 'text/csv' },
            });
        }

        return Response.json({ code: 'not_found' }, { status: 404 });
    };
    const shares: SharesBackend = { base: APIS, fetch: fetcher, nameCaller: () => {} };

    return { deps: { shares }, calls };
};

test("a snapshot's slotted cards are drawn on the server on the frame each slot recorded", async () => {
    // A live share made a snapshot after a data release: its slot recorded a
    // newer frame than the card's revision stands on.
    const { deps, calls } = depsOf(recordOf('snapshot'), MOVED_FRAME);
    const view = await sharedViewOfRecord(deps, recordOf('snapshot'));
    const [chart, table, note] = view.saved.widgets;

    assert.equal(view.live, false);
    assert.deepEqual(view.undrawn, []);
    // Only the slotted card names a slot; its URLs carry it.
    assert.deepEqual(view.slots, { c1: 1 });
    assert.ok(chart?.kind === 'chart');
    assert.ok(chart.series.length > 0 && chart.title);
    assert.deepEqual(chart.frame, MOVED_FRAME);
    assert.deepEqual(chart.ref, { component_id: 'cmp_a', revision: 2 });
    // A snapshot's card with no slot stays as stored, and so does a note.
    assert.deepEqual(table, { kind: 'table', id: 'c2', turn: 1 });
    assert.deepEqual(note, NOTE);
    // The slot card read, never the revision's own read, with no credential,
    // and one read of the share's history.
    assert.deepEqual(calls.map(({ path }) => path).toSorted(), [
        '/api/presentation/shares/Ab3dEf7h/history?limit=500',
        '/api/presentation/shares/Ab3dEf7h/slots/1',
    ]);
    assert.ok(calls.every(({ headers }) => headers.get('x-dfo-principal') === null));
});

const servedEntry = (slot: number, frame: typeof DATASET_FRAME | null, at: string) => ({
    slot,
    component_id: frame && 'cmp_a',
    revision: frame && 2,
    frame,
    rendering: null,
    first_served_at: at,
    retention: null,
    fetchable: frame !== null,
});

test("a snapshot card's citation date is when its slot began to show the frame it serves", async () => {
    const record = recordOf('snapshot');
    // Newest first: the live share moved on and back, and slot 2 was emptied.
    const history = [
        servedEntry(2, null, '2026-10-29T09:00:00Z'),
        servedEntry(1, DATASET_FRAME, '2026-10-28T15:00:00Z'),
        servedEntry(1, MOVED_FRAME, '2026-10-28T12:00:00Z'),
        servedEntry(1, DATASET_FRAME, '2026-10-28T10:00:00Z'),
    ];
    const { deps } = depsOf(record, DATASET_FRAME, undefined, () =>
        Response.json({ id: record.id, served: history }),
    );

    assert.deepEqual((await sharedViewOfRecord(deps, record)).servedAt, {
        c1: '2026-10-28T15:00:00Z',
    });

    // A slot that changes slowly has its entry on a later page: the cursor
    // is followed until it turns up.
    const paged = depsOf(record, DATASET_FRAME, undefined, (url) =>
        url.searchParams.get('before') === 'p2'
            ? Response.json({ id: record.id, served: history.slice(1), next: 'p3' })
            : Response.json({ id: record.id, served: [history[0]], next: 'p2' }),
    );

    assert.deepEqual((await sharedViewOfRecord(paged.deps, record)).servedAt, {
        c1: '2026-10-28T15:00:00Z',
    });
    assert.deepEqual(
        paged.calls.flatMap(({ path }) => (path.includes('/history') ? [path] : [])),
        [
            '/api/presentation/shares/Ab3dEf7h/history?limit=500',
            '/api/presentation/shares/Ab3dEf7h/history?limit=500&before=p2',
        ],
    );

    // No entry for the slot's frame by the end of the history, a later page
    // that fails, a cursor that names the page just read, or no history: no
    // date, and the cards are drawn all the same.
    for (const reply of [
        (url: URL) =>
            url.searchParams.has('before')
                ? Response.json({ id: record.id, served: [history[2]], next: null })
                : Response.json({ id: record.id, served: [history[0]], next: 'p2' }),
        (url: URL) =>
            url.searchParams.has('before')
                ? Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 })
                : Response.json({ id: record.id, served: [history[0]], next: 'p2' }),
        (url: URL) =>
            Response.json({
                id: record.id,
                served: [history[0]],
                next: url.searchParams.get('before') ?? 'p2',
            }),
        () => Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 }),
        () => Response.json({ id: record.id, served: [{ slot: 1 }] }),
    ]) {
        const view = await sharedViewOfRecord(
            depsOf(record, DATASET_FRAME, undefined, reply).deps,
            record,
        );

        assert.deepEqual(view.servedAt, {});
        assert.deepEqual(view.undrawn, []);
    }

    // A live share's page reads no history.
    const live = depsOf(recordOf('live'));

    assert.deepEqual((await sharedViewOfRecord(live.deps, recordOf('live'))).servedAt, {});
    assert.equal(live.calls.length, 0);
});

test('a snapshot card the server cannot read stays held and is named for the browser to fill', async () => {
    const { deps } = depsOf(recordOf('snapshot'), DATASET_FRAME, () =>
        Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 }),
    );
    const view = await sharedViewOfRecord(deps, recordOf('snapshot'));
    const [chart] = view.saved.widgets;

    assert.deepEqual(view.undrawn, ['c1']);
    assert.ok(chart?.kind === 'chart');
    assert.deepEqual(chart.series, []);
    assert.deepEqual(chart.ref, { component_id: 'cmp_a', revision: 2 });
});

test('a snapshot page waits a few seconds at most, and leaves an unread card for the browser', async () => {
    // A slot card read that answers only when its request is given up.
    const { deps } = depsOf(
        recordOf('snapshot'),
        DATASET_FRAME,
        ({ signal }) =>
            new Promise((_resolve, reject) =>
                signal?.addEventListener('abort', () => reject(signal.reason)),
            ),
    );
    const view = await sharedViewOfRecord(deps, recordOf('snapshot'), { deadlineMs: 20 });
    const [chart] = view.saved.widgets;

    assert.deepEqual(view.undrawn, ['c1']);
    assert.deepEqual(view.slots, { c1: 1 });
    assert.ok(chart?.kind === 'chart');
    assert.deepEqual(chart.series, []);
});

test("an SDK share's page draws one card per filled slot, titled by the slot's card", async () => {
    const snapshot = sdkRecordOf('snapshot');
    const { deps, calls } = depsOf(snapshot);
    // The record as readShare parses dfo-apis' answer.
    const record = await readShare(deps.shares, snapshot.id);

    assert.ok(record);

    const view = await sharedViewOfRecord(deps, record);
    const [card, ...rest] = view.saved.widgets;

    assert.equal(view.kind, 'card');
    assert.deepEqual(rest, []);
    // Held as a table, drawn as the chart its slot serves.
    assert.ok(card?.kind === 'chart');
    assert.equal(card.id, 'slot-1');
    assert.ok(card.title && card.series.length > 0);
    assert.deepEqual(card.ref, { component_id: 'cmp_a', revision: 2 });
    assert.deepEqual(view.slots, { 'slot-1': 1 });
    assert.deepEqual(view.undrawn, []);
    assert.equal(view.saved.title, '');
    assert.deepEqual(view.saved.layout, {});
    assert.equal(calls.at(-1)?.path, '/api/presentation/shares/Sd9kSh4r/slots/1');

    // A live one leaves the card held for the browser, with its slot.
    const live = await sharedViewOfRecord(depsOf(sdkRecordOf('live')).deps, sdkRecordOf('live'));

    assert.deepEqual(live.saved.widgets, [
        {
            kind: 'table',
            id: 'slot-1',
            turn: 1,
            title: '',
            columns: [],
            rows: [],
            ref: { component_id: 'cmp_a', revision: 2 },
        },
    ]);
    assert.deepEqual(live.slots, { 'slot-1': 1 });
});

test("a conversation share's cards name no slot, so they export their own revisions", async () => {
    const record: ShareRecord = {
        ...recordOf('snapshot'),
        kind: 'conversation',
        slots: [],
        payload: {
            ...(recordOf('snapshot').payload as object),
            widgets: [{ kind: 'table', id: 'c2', turn: 1, title: 'T', columns: [], rows: [] }],
        },
    };
    const { deps, calls } = depsOf(record);
    const view = await sharedViewOfRecord(deps, record);

    assert.deepEqual(view.slots, {});
    assert.equal(calls.length, 0);
});

test("a live share's data cards leave the server held, with their slot's ref", async () => {
    const { deps, calls } = depsOf(recordOf('live'));
    const view = await sharedViewOfRecord(deps, recordOf('live'));

    assert.equal(view.live, true);
    assert.deepEqual(view.saved.widgets, [
        {
            kind: 'chart',
            id: 'c1',
            turn: 1,
            chartType: 'line',
            horizontal: undefined,
            title: '',
            categories: [],
            series: [],
            ref: { component_id: 'cmp_a', revision: 2 },
        },
        { kind: 'table', id: 'c2', turn: 1, title: '', columns: [], rows: [], ref: undefined },
        NOTE,
    ]);
    assert.deepEqual(view.undrawn, []);
    assert.equal(calls.length, 0);
});

test("a live card is its slot's card from dfo-apis, under the slot's ETag and caching", async () => {
    for (const [served, status] of [
        [DATASET_FRAME, 'current'],
        [MOVED_FRAME, 'redrawn'],
    ] as const) {
        const { deps, calls } = depsOf(recordOf('live'), served);
        const response = await slotRefreshResponse(deps, 'Ab3dEf7h', 1);
        const answer = await response.json();

        assert.equal(answer.status, status);
        assert.equal(answer.card.component_id, 'cmp_a');
        assert.deepEqual(answer.card.payload.provenance.inputs, [served]);
        assert.equal(response.headers.get('etag'), ETAG);
        assert.equal(response.headers.get('cache-control'), 'no-cache');
        // The one slot card read, with no read of the share, and no credential.
        assert.deepEqual(
            calls.map(({ path }) => path),
            ['/api/presentation/shares/Ab3dEf7h/slots/1'],
        );
        assert.ok(calls.every(({ headers }) => !headers.has('x-dfo-principal')));
    }
});

test("the browser's If-None-Match reaches dfo-apis, and its 304 comes back", async () => {
    const { deps, calls } = depsOf(recordOf('live'));
    const response = await slotRefreshResponse(deps, 'Ab3dEf7h', 1, ETAG);

    assert.equal(response.status, 304);
    assert.equal(response.headers.get('etag'), ETAG);
    assert.equal(await response.text(), '');
    assert.equal(calls.at(-1)?.headers.get('if-none-match'), ETAG);
});

test("a slot card refusal is the card's error, not stored", async () => {
    const { deps } = depsOf(recordOf('live'), DATASET_FRAME, () =>
        Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 }),
    );
    const response = await slotRefreshResponse(deps, 'Ab3dEf7h', 1);

    assert.deepEqual(await response.json(), {
        status: 'error',
        code: 'service_unavailable',
        retryable: true,
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
});

test('a card route with no slot, or a slot dfo-apis does not have, is 404', async () => {
    const { deps, calls } = depsOf(recordOf('live'));
    const cases: [string, Response][] = [
        ['no slot', await slotRefreshResponse(deps, 'Ab3dEf7h', null)],
        ['no slot', await slotDataResponse(deps, 'Ab3dEf7h', new URLSearchParams())],
        ['slot 0', await slotDataResponse(deps, 'Ab3dEf7h', new URLSearchParams({ slot: '0' }))],
        // dfo-apis answers 404 not_found for a slot the share has not had.
        ['slot 2', await slotRefreshResponse(deps, 'Ab3dEf7h', 2)],
        ['no such share', await slotRefreshResponse(deps, 'Zz9yXx8w', 1)],
        ['share id not in form', await slotRefreshResponse(deps, '../x', 1)],
    ];

    for (const [name, response] of cases) {
        assert.equal(response.status, 404, name);
        assert.equal((await response.json()).code, 'not_found', name);
    }

    // No route reads the share record.
    assert.ok(calls.every(({ path }) => path.includes('/slots/')));
});

test('a slot query is a whole number from 1', () => {
    for (const [value, slot] of [
        ['1', 1],
        ['12', 12],
        [null, null],
        ['', null],
        ['0', null],
        ['-1', null],
        ['1.5', null],
        ['01', null],
        ['1e3', null],
        ['9999999999', null],
    ] as const) {
        assert.equal(slotOfQuery(value), slot, String(value));
    }
});

test("a snapshot card's refresh and rows come from its slot, on the frame the slot recorded", async () => {
    const { deps, calls } = depsOf(recordOf('snapshot'), MOVED_FRAME);
    const refreshed = await slotRefreshResponse(deps, 'Ab3dEf7h', 1);

    assert.equal(refreshed.status, 200);
    assert.deepEqual((await refreshed.json()).card.payload.provenance.inputs, [MOVED_FRAME]);

    const file = await slotDataResponse(deps, 'Ab3dEf7h', new URLSearchParams({ slot: '1' }));

    assert.equal(file.status, 200);
    assert.equal(
        calls.at(-1)?.path,
        '/api/presentation/shares/Ab3dEf7h/slots/1/data?format=csv&bundle=true',
    );
});

test("a live card's rows come from the slot data route in the format and bundle asked, on any frame", async () => {
    const rows: [Record<string, string>, string][] = [
        [{ format: 'csv', bundle: 'false' }, 'format=csv&bundle=false'],
        [{ format: 'parquet', bundle: 'false' }, 'format=parquet&bundle=false'],
        [{ format: 'csv', bundle: 'true' }, 'format=csv&bundle=true'],
        [{ format: 'xlsx', bundle: 'false' }, 'format=xlsx&bundle=false'],
        [{ format: 'xlsx', bundle: 'true' }, 'format=xlsx&bundle=true'],
        // The components route's default, a CSV bundle, is sent explicitly.
        [{}, 'format=csv&bundle=true'],
        [{ format: 'parquet' }, 'format=parquet&bundle=true'],
    ];

    for (const served of [DATASET_FRAME, MOVED_FRAME]) {
        for (const [query, expected] of rows) {
            const { deps, calls } = depsOf(recordOf('live'), served);
            const response = await slotDataResponse(
                deps,
                'Ab3dEf7h',
                new URLSearchParams({ slot: '1', ...query }),
            );
            const name = `${served.content_version} ${JSON.stringify(query)}`;

            assert.equal(response.status, 200, name);
            assert.equal(await response.text(), 'year,value\n2024,1\n', name);
            assert.equal(
                calls.at(-1)?.path,
                `/api/presentation/shares/Ab3dEf7h/slots/1/data?${expected}`,
                name,
            );
            // Never the stored revision's export, and no credential.
            assert.ok(
                calls.every(
                    ({ path, headers }) =>
                        !path.startsWith('/api/presentation/components/cmp_a/revisions') &&
                        !headers.has('x-dfo-principal'),
                ),
                name,
            );
        }
    }
});

test("dfo-apis' refusal of a live card's format or bundle comes back as a problem, not a file", async () => {
    const record = recordOf('live');
    const { deps } = depsOf(record);
    const refusing: SlotDeps = {
        shares: {
            ...deps.shares,
            fetch: async (input, init) =>
                new URL(String(input)).pathname.endsWith('/data')
                    ? Response.json({ code: 'request_invalid', retryable: false }, { status: 400 })
                    : deps.shares.fetch(input, init),
        },
    };
    const response = await slotDataResponse(
        refusing,
        'Ab3dEf7h',
        new URLSearchParams({ slot: '1', format: 'json', bundle: 'true' }),
    );

    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'request_invalid');
    assert.equal(response.headers.get('cache-control'), 'no-store');
});

// A live share's create body: chart c1 in slot 0 and table c2 in slot 1.
const liveBody = (cards: CreateShareBody['cards']): Pick<CreateShareBody, 'cards' | 'payload'> => ({
    cards,
    payload: {
        widgets: cards.map((_card, slot) => ({ kind: 'chart', id: `c${slot + 1}`, turn: 1, slot })),
    },
});

/** A dfo-apis whose component reads answer by component id; a component
 *  left out answers 404. */
const readsOf = (answers: Record<string, () => Response>): { deps: SlotDeps; paths: string[] } => {
    const paths: string[] = [];
    const fetcher: typeof fetch = async (input) => {
        const url = new URL(String(input));
        const answer = answers[url.pathname.split('/').at(-1) ?? ''];

        paths.push(`${url.pathname}${url.search}`);

        return answer ? answer() : Response.json({ code: 'not_found' }, { status: 404 });
    };

    return { deps: { shares: { base: APIS, fetch: fetcher, nameCaller: () => {} } }, paths };
};

test("a live share's cards pass the check when dfo-apis reads each on a frame a slot can follow", async () => {
    const { deps, paths } = readsOf({
        cmp_a: () => Response.json(componentRead('cmp_a', 2, DATASET_FRAME)),
        cmp_b: () =>
            Response.json(
                componentRead('cmp_b', 1, { spec_id: 'ops_x', content_version: 'ocv_1' }),
            ),
    });
    const body = liveBody([
        { component_id: 'cmp_a', revision: 2 },
        { component_id: 'cmp_b', revision: 1 },
    ]);

    assert.equal(await liveCardsRefusal(deps, body), null);
    assert.deepEqual(paths.toSorted(), [
        '/api/presentation/components/cmp_a?revision=2',
        '/api/presentation/components/cmp_b?revision=1',
    ]);
});

test("a live share's check names each card that fails, by its widget", async () => {
    const { deps } = readsOf({
        cmp_a: () => Response.json(componentRead('cmp_a', 2, DATASET_FRAME)),
        cmp_n: () => Response.json(componentRead('cmp_n', 1, null)),
    });
    const refusal = await liveCardsRefusal(
        deps,
        liveBody([
            { component_id: 'cmp_a', revision: 2 },
            { component_id: 'cmp_gone', revision: 1 },
            { component_id: 'cmp_n', revision: 1 },
        ]),
    );
    const body = await refusal?.json();

    assert.equal(refusal?.status, 400);
    assert.equal(body.code, 'live_cards_blocked');
    assert.deepEqual(body.cards, [
        { id: 'c2', reason: 'unknown_component' },
        { id: 'c3', reason: 'unsupported_frame' },
    ]);
});

test("a live share's check refuses past the card cap without a read, and a failed read as transient", async () => {
    const many = Array.from({ length: LIVE_SHARE_MAX_DATA_CARDS + 1 }, (_card, index) => ({
        component_id: `cmp_${index}`,
        revision: 1,
    }));
    const capped = readsOf({});
    const over = await liveCardsRefusal(capped.deps, liveBody(many));

    assert.equal(over?.status, 400);
    assert.deepEqual(
        await over?.json().then(({ code, limit, count }) => ({ code, limit, count })),
        { code: 'live_too_many_cards', limit: LIVE_SHARE_MAX_DATA_CARDS, count: many.length },
    );
    assert.equal(capped.paths.length, 0);

    const down = readsOf({
        cmp_a: () => Response.json({ code: 'service_unavailable' }, { status: 503 }),
    });
    const failed = await liveCardsRefusal(
        down.deps,
        liveBody([{ component_id: 'cmp_a', revision: 2 }]),
    );

    assert.equal(failed?.status, 502);
    assert.equal((await failed?.json()).code, 'transient_unavailable');
});

test("a live share's check reads only a 404 as a card that names no component", async () => {
    for (const status of [400, 403, 409, 429]) {
        const { deps } = readsOf({
            cmp_a: () => Response.json({ code: 'refused' }, { status }),
        });
        const refusal = await liveCardsRefusal(
            deps,
            liveBody([{ component_id: 'cmp_a', revision: 2 }]),
        );

        assert.equal(refusal?.status, 502, String(status));
        assert.equal((await refusal?.json()).code, 'transient_unavailable', String(status));
    }
});
