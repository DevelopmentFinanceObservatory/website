import assert from 'node:assert/strict';
import test from 'node:test';

import type { CreateShareBody, ShareRecord, SharesBackend } from '../../chat/apisShares.ts';
import {
    liveCardsRefusal,
    LIVE_SHARE_MAX_DATA_CARDS,
    sharedViewOfRecord,
    slotDataResponse,
    slotRefreshResponse,
    type SlotDeps,
} from '../slotCards.ts';
import { APIS, componentRead, DATASET_FRAME, MOVED_FRAME } from './fixtures/live-backend-stub.ts';

type Call = { method: string; path: string; headers: Headers };

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
    slots: record.slots.map((slot) => ({ ...slot, data_url: 'x' })),
    payload: record.payload,
    created_at: record.createdAt,
});

const ETAG = '"slot-card-1"';

// dfo-apis' slot card: the revision's component read, drawn on `served`.
const slotCard = (served: typeof DATASET_FRAME) => {
    const body = componentRead('cmp_a', 2, DATASET_FRAME);

    body['resolved_payload'].provenance.inputs = [served];

    return { ...body, freshness: 'current', retention: null };
};

/** A dfo-apis holding `record`, whose slot 1 serves `served`. `slotReply`
 *  replaces its slot card answer. */
const depsOf = (
    record: ShareRecord,
    served = DATASET_FRAME,
    slotReply?: (call: Call) => Response,
): { deps: SlotDeps; calls: Call[] } => {
    const calls: Call[] = [];
    const fetcher: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        const call = {
            method: init?.method ?? 'GET',
            path: `${url.pathname}${url.search}`,
            headers: new Headers(init?.headers),
        };

        calls.push(call);

        if (url.pathname === `/api/presentation/shares/${record.id}`) {
            return Response.json(shareBody(record));
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

test("a snapshot's slotted cards are drawn from their revisions on the server", async () => {
    const { deps, calls } = depsOf(recordOf('snapshot'));
    const view = await sharedViewOfRecord(deps, recordOf('snapshot'));
    const [chart, table, note] = view.saved.widgets;

    assert.equal(view.live, false);
    assert.ok(chart?.kind === 'chart');
    assert.ok(chart.series.length > 0 && chart.title);
    assert.deepEqual(chart.ref, { component_id: 'cmp_a', revision: 2 });
    // A snapshot's card with no slot stays as stored, and so does a note.
    assert.deepEqual(table, { kind: 'table', id: 'c2', turn: 1 });
    assert.deepEqual(note, NOTE);
    // The revision's public read, with no slot read and no credential.
    assert.deepEqual(
        calls.map(({ path }) => path),
        ['/api/presentation/components/cmp_a?revision=2'],
    );
    assert.equal(calls[0]?.headers.get('x-dfo-principal'), null);
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
    assert.equal(calls.length, 0);
});

test("a live card is its slot's card from dfo-apis, under the slot's ETag and caching", async () => {
    for (const [served, status] of [
        [DATASET_FRAME, 'current'],
        [MOVED_FRAME, 'redrawn'],
    ] as const) {
        const { deps, calls } = depsOf(recordOf('live'), served);
        const response = await slotRefreshResponse(deps, 'Ab3dEf7h', 'c1');
        const answer = await response.json();

        assert.equal(answer.status, status);
        assert.equal(answer.card.component_id, 'cmp_a');
        assert.deepEqual(answer.card.payload.provenance.inputs, [served]);
        assert.equal(response.headers.get('etag'), ETAG);
        assert.equal(response.headers.get('cache-control'), 'no-cache');
        // The share read, then the one slot card read, with no credential.
        assert.deepEqual(
            calls.map(({ path }) => path),
            ['/api/presentation/shares/Ab3dEf7h', '/api/presentation/shares/Ab3dEf7h/slots/1'],
        );
        assert.ok(calls.every(({ headers }) => !headers.has('x-dfo-principal')));
    }
});

test("the browser's If-None-Match reaches dfo-apis, and its 304 comes back", async () => {
    const { deps, calls } = depsOf(recordOf('live'));
    const response = await slotRefreshResponse(deps, 'Ab3dEf7h', 'c1', ETAG);

    assert.equal(response.status, 304);
    assert.equal(response.headers.get('etag'), ETAG);
    assert.equal(await response.text(), '');
    assert.equal(calls.at(-1)?.headers.get('if-none-match'), ETAG);
});

test("a slot card refusal is the card's error, not stored", async () => {
    const { deps } = depsOf(recordOf('live'), DATASET_FRAME, () =>
        Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 }),
    );
    const response = await slotRefreshResponse(deps, 'Ab3dEf7h', 'c1');

    assert.deepEqual(await response.json(), {
        status: 'error',
        code: 'service_unavailable',
        retryable: true,
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
});

test('a card no live slot draws is 404', async () => {
    for (const [mode, cardId] of [
        ['snapshot', 'c1'],
        ['live', 'c2'],
        ['live', 'n1'],
        ['live', 'nope'],
    ] as const) {
        const { deps } = depsOf(recordOf(mode));
        const response = await slotRefreshResponse(deps, 'Ab3dEf7h', cardId);

        assert.equal(response.status, 404, `${mode} ${cardId}`);
    }

    const { deps } = depsOf(recordOf('live'));

    assert.equal((await slotRefreshResponse(deps, 'Zz9yXx8w', 'c1')).status, 404);
});

test("a live card's rows are the slot's file, or the stored export while the slot serves the revision's frame", async () => {
    const rows: [typeof DATASET_FRAME, Record<string, string>, string | number][] = [
        // Unbundled CSV and Parquet are dfo-apis' slot data route, on any frame.
        [
            MOVED_FRAME,
            { format: 'csv', bundle: 'false' },
            '/api/presentation/shares/Ab3dEf7h/slots/1/data?format=csv',
        ],
        [
            MOVED_FRAME,
            { format: 'parquet', bundle: 'false' },
            '/api/presentation/shares/Ab3dEf7h/slots/1/data?format=parquet',
        ],
        // A bundle or Excel file is the stored revision's export on its own frame.
        [
            DATASET_FRAME,
            { format: 'csv', bundle: 'true' },
            '/api/presentation/components/cmp_a/revisions/2/data?format=csv&bundle=true',
        ],
        [
            DATASET_FRAME,
            { format: 'xlsx', bundle: 'false' },
            '/api/presentation/components/cmp_a/revisions/2/data?format=xlsx&bundle=false',
        ],
        // ... and refused on newer data, which only the slot data route draws.
        [MOVED_FRAME, { format: 'csv', bundle: 'true' }, 422],
        [MOVED_FRAME, { format: 'xlsx', bundle: 'false' }, 422],
    ];

    for (const [served, query, expected] of rows) {
        const { deps, calls } = depsOf(recordOf('live'), served);
        const response = await slotDataResponse(deps, 'Ab3dEf7h', 'c1', new URLSearchParams(query));
        const name = `${served.content_version} ${JSON.stringify(query)}`;

        if (typeof expected === 'number') {
            assert.equal(response.status, expected, name);
            assert.equal((await response.json()).code, 'live_file_unavailable', name);
            continue;
        }

        assert.equal(response.status, 200, name);
        assert.equal(await response.text(), 'year,value\n2024,1\n', name);
        assert.equal(calls.at(-1)?.path, expected, name);
        assert.ok(
            calls.every(({ headers }) => !headers.has('x-dfo-principal')),
            name,
        );
    }
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
