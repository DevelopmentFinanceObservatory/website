import assert from 'node:assert/strict';
import test from 'node:test';

import type { ShareRecord, SharesBackend } from '../../chat/apisShares.ts';
import type { LiveBackend } from '../liveBackend.ts';
import {
    sharedViewOfRecord,
    slotDataResponse,
    slotRefreshResponse,
    type SlotDeps,
} from '../slotCards.ts';
import {
    APIS,
    componentRead,
    DATASET_FRAME,
    MOVED_FRAME,
    PRINCIPAL,
    renderReply,
} from './fixtures/live-backend-stub.ts';

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

/** A dfo-apis holding `record`, whose slot 1 serves `served`. */
const depsOf = (
    record: ShareRecord,
    served = DATASET_FRAME,
    { render = true } = {},
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

        if (url.pathname === `/api/presentation/shares/${record.id}/slots/1/data`) {
            return Response.json({
                share_id: record.id,
                slot: 1,
                mode: record.mode,
                freshness: 'current',
                component_id: 'cmp_a',
                revision: 2,
                frame: served,
                rows: [],
            });
        }

        if (url.pathname === '/api/presentation/components/cmp_a') {
            return Response.json(componentRead('cmp_a', 2, DATASET_FRAME));
        }

        if (url.pathname === '/api/presentation/components/cmp_a/revisions/2/render') {
            return Response.json(renderReply('cmp_a', 2, MOVED_FRAME));
        }

        if (url.pathname.endsWith('/data')) {
            return new Response('year,value\n2024,1\n', {
                headers: { 'content-type': 'text/csv' },
            });
        }

        return Response.json({ code: 'not_found' }, { status: 404 });
    };
    const shares: SharesBackend = { base: APIS, fetch: fetcher, nameCaller: () => {} };
    const live: LiveBackend = { apisBase: APIS, aiBase: '', principal: PRINCIPAL, fetch: fetcher };

    return { deps: { shares, render: render ? live : null }, calls };
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

test('a live card on its own frame is its revision, with no render', async () => {
    const { deps, calls } = depsOf(recordOf('live'));
    const answer = await (await slotRefreshResponse(deps, 'Ab3dEf7h', 'c1')).json();

    assert.equal(answer.status, 'current');
    assert.equal(answer.card.component_id, 'cmp_a');
    assert.ok(calls.some(({ path }) => path.endsWith('/slots/1/data?format=json')));
    assert.ok(!calls.some(({ path }) => path.endsWith('/render')));
});

test('a live card whose slot serves moved data is drawn on that frame', async () => {
    const { deps, calls } = depsOf(recordOf('live'), MOVED_FRAME);
    const answer = await (await slotRefreshResponse(deps, 'Ab3dEf7h', 'c1')).json();
    const render = calls.find(({ path }) => path.endsWith('/render'));

    assert.equal(answer.status, 'redrawn');
    assert.deepEqual(answer.card.payload.provenance.inputs, [MOVED_FRAME]);
    assert.equal(render?.headers.get('x-dfo-principal'), PRINCIPAL);
});

test('a moved live card answers live_unavailable without the credential', async () => {
    const { deps } = depsOf(recordOf('live'), MOVED_FRAME, { render: false });

    assert.deepEqual(await (await slotRefreshResponse(deps, 'Ab3dEf7h', 'c1')).json(), {
        status: 'error',
        code: 'live_unavailable',
    });
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

test("a live card's rows come from the export of the frame its slot serves", async () => {
    const query = new URLSearchParams({ format: 'csv', bundle: 'false' });

    for (const [served, expected] of [
        [
            DATASET_FRAME,
            '/api/presentation/components/cmp_a/revisions/2/data?format=csv&bundle=false',
        ],
        [
            MOVED_FRAME,
            `/api/presentation/components/cmp_a/revisions/2/render/data?format=csv&bundle=false&spec_id=${MOVED_FRAME.spec_id}&content_version=${MOVED_FRAME.content_version}`,
        ],
    ] as const) {
        const { deps, calls } = depsOf(recordOf('live'), served);
        const response = await slotDataResponse(deps, 'Ab3dEf7h', 'c1', query);

        assert.equal(response.status, 200);
        assert.equal(await response.text(), 'year,value\n2024,1\n');
        assert.equal(calls.at(-1)?.path, expected);
    }
});
