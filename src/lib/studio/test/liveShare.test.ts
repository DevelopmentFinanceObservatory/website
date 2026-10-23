/**
 * `liveShare.ts` and `liveBackend.ts` against a stubbed dfo-apis and dfo-ai:
 * how one card of a live share is refreshed, what each back-end answer
 * becomes, which calls carry the credential, and what a share must hold to
 * be live. The lease, the stored answers, and the two routes' responses are
 * tested on a database in db/test/live-share.test.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConversation } from '../../chat/history.ts';
import type { ChartWidget, Widget } from '../../chat/widgets.ts';
import {
    BackendError,
    liveBackendFrom,
    readComponent,
    renderedExport,
    renderOnFrame,
    storedExport,
    type LiveBackend,
} from '../liveBackend.ts';
import {
    LIVE_SHARE_MAX_DATA_CARDS,
    liveShareRefusal,
    liveSharingAvailable,
    refreshCard,
} from '../liveShare.ts';
import { liveWindowSeconds, pendingSeconds } from '../liveShareResults.ts';
import {
    AI,
    APIS,
    DATASET_FRAME,
    DERIVED_FRAME,
    ENV,
    MOVED_FRAME,
    PRINCIPAL,
    REPLAYED_FRAME,
    aiCurrent,
    aiPending,
    aiRedrawn,
    aiRefusal,
    componentRead,
    frameAnswer,
    json,
    pendingAnswer,
    refusal,
    renderReply,
    stubBackend,
    type StubScript,
} from './fixtures/live-backend-stub.ts';

const REF = { component_id: 'cmp_data', revision: 3 };
const DERIVED_REF = { component_id: 'cmp_derived', revision: 2 };

const backendOver = (script: StubScript) => {
    const stub = stubBackend(script);
    const backend = liveBackendFrom(ENV, stub.fetch) as LiveBackend;

    return { stub, backend };
};

const chart = (id: string, ref?: ChartWidget['ref']): ChartWidget => ({
    kind: 'chart',
    id,
    chartType: 'line',
    title: id,
    categories: ['2024'],
    series: [{ label: 'Kenya', values: [1] }],
    ...(ref ? { ref } : {}),
});

const canvas = (widgets: Widget[], removedIds: string[] = []): SavedConversation =>
    ({
        id: 'conv-1',
        sessionId: null,
        title: 'Aid',
        updatedAt: 1,
        messages: [],
        widgets: widgets.map((widget) => ({ ...widget, turn: 1 })),
        turnCount: 1,
        pinnedIds: [],
        removedIds,
        layout: {},
    }) as SavedConversation;

test('refreshCard: a dataset card whose frame stands is the stored revision’s read', async () => {
    const { stub, backend } = backendOver({
        components: { cmp_data: DATASET_FRAME },
        refreshFrame: () => frameAnswer('current', DATASET_FRAME),
    });

    const result = await refreshCard(backend, REF);
    const read = componentRead('cmp_data', 3, DATASET_FRAME);

    assert.deepEqual(result, {
        status: 'current',
        card: {
            component_id: 'cmp_data',
            revision: 3,
            payload: read.resolved_payload,
            fact_summary: read.fact_summary,
        },
    });

    // The frame checked is the one the stored intent names.
    const [check] = stub.to('/frames/refresh');

    assert.deepEqual(check?.body, DATASET_FRAME);
    assert.equal(check?.headers.get('x-dfo-principal'), PRINCIPAL);
    assert.equal(stub.to('/render').length, 0);
    assert.equal(stub.to('/api/studio/refresh').length, 0);
});

test('refreshCard: a dataset card whose data moved is rendered on the returned frame', async () => {
    const { stub, backend } = backendOver({
        components: { cmp_data: DATASET_FRAME },
        refreshFrame: () => frameAnswer('moved', MOVED_FRAME),
        render: () => json(renderReply('cmp_data', 3, MOVED_FRAME)),
    });

    const result = await refreshCard(backend, REF);
    const rendered = renderReply('cmp_data', 3, MOVED_FRAME);

    assert.deepEqual(result, {
        status: 'redrawn',
        frame: MOVED_FRAME,
        card: {
            component_id: 'cmp_data',
            revision: 3,
            payload: rendered.resolved_payload,
            fact_summary: rendered.fact_summary,
        },
    });

    const [render] = stub.to('/render');

    assert.equal(render?.url, `${APIS}/api/presentation/components/cmp_data/revisions/3/render`);
    assert.deepEqual(render?.body, { frame: MOVED_FRAME });
    assert.equal(render?.headers.get('x-dfo-principal'), PRINCIPAL);
});

test('refreshCard: a queued rebuild is pending for the wait dfo-apis names', async () => {
    const { stub, backend } = backendOver({
        components: { cmp_data: DATASET_FRAME },
        refreshFrame: () => pendingAnswer(8),
    });

    assert.deepEqual(await refreshCard(backend, REF), { status: 'pending', retryAfterS: 8 });
    assert.equal(stub.to('/render').length, 0);
});

test('refreshCard: a derived card goes to dfo-ai with the credential as a bearer', async () => {
    const stored = componentRead('cmp_derived', 2, DERIVED_FRAME);
    const rendered = renderReply('cmp_derived', 2, REPLAYED_FRAME);
    const cases = [
        {
            reply: () => aiCurrent(),
            expected: {
                status: 'current',
                card: {
                    component_id: 'cmp_derived',
                    revision: 2,
                    payload: stored.resolved_payload,
                    fact_summary: stored.fact_summary,
                },
            },
        },
        {
            reply: () => aiRedrawn(rendered),
            expected: {
                status: 'redrawn',
                frame: REPLAYED_FRAME,
                card: {
                    component_id: 'cmp_derived',
                    revision: 2,
                    payload: rendered.resolved_payload,
                    fact_summary: rendered.fact_summary,
                },
            },
        },
        {
            reply: () => aiPending(12),
            expected: { status: 'pending', retryAfterS: 12 },
        },
    ];

    for (const { reply, expected } of cases) {
        const { stub, backend } = backendOver({
            components: { cmp_derived: DERIVED_FRAME },
            refreshDerived: reply,
        });

        assert.deepEqual(await refreshCard(backend, DERIVED_REF), expected);

        const [call] = stub.to('/api/studio/refresh');

        assert.equal(call?.url, `${AI}/api/studio/refresh`);
        assert.deepEqual(call?.body, DERIVED_REF);
        assert.equal(call?.headers.get('authorization'), `Bearer ${PRINCIPAL}`);
        assert.equal(call?.headers.get('x-dfo-principal'), null);
        // dfo-apis is asked for the stored revision only.
        assert.equal(stub.to('/frames/refresh').length, 0);
        assert.equal(stub.to('/render').length, 0);
    }
});

test('refreshCard: the public component read carries no credential', async () => {
    const { stub, backend } = backendOver({
        components: { cmp_data: DATASET_FRAME },
        refreshFrame: () => frameAnswer('current', DATASET_FRAME),
    });

    await refreshCard(backend, REF);

    const [read] = stub.to('/components/cmp_data');

    assert.equal(read?.url, `${APIS}/api/presentation/components/cmp_data?revision=3`);
    assert.equal(read?.headers.get('x-dfo-principal'), null);
    assert.equal(read?.headers.get('authorization'), null);
});

test('refreshCard: every back-end failure is an error with a machine-readable code', async () => {
    const down = (): never => {
        throw new TypeError('fetch failed');
    };
    const timedOut = (): never => {
        throw new DOMException('timed out', 'TimeoutError');
    };
    const cases: [string, StubScript, typeof REF, string][] = [
        ['component unknown', { components: {} }, REF, 'not_found'],
        ['intent names no frame', { components: { cmp_data: null } }, REF, 'frame_unsupported'],
        [
            'frame of neither kind',
            { components: { cmp_data: { spec_id: 'frm_1', content_version: 'cv' } } },
            REF,
            'frame_unsupported',
        ],
        [
            'dfo-apis refuses the frame',
            {
                components: { cmp_data: DATASET_FRAME },
                refreshFrame: (call) => refusal('frame_rendering_unrecorded', 409, call),
            },
            REF,
            'frame_rendering_unrecorded',
        ],
        [
            'dfo-apis refuses the render',
            {
                components: { cmp_data: DATASET_FRAME },
                refreshFrame: () => frameAnswer('moved', MOVED_FRAME),
                render: (call) => refusal('render_target_mismatch', 409, call),
            },
            REF,
            'render_target_mismatch',
        ],
        [
            'dfo-ai refuses with 422',
            {
                components: { cmp_derived: DERIVED_FRAME },
                refreshDerived: (call) => aiRefusal('recipe_missing', call),
            },
            DERIVED_REF,
            'recipe_missing',
        ],
        [
            'a refusal with no readable code',
            {
                components: { cmp_data: DATASET_FRAME },
                refreshFrame: () => json({ code: `Bad credential ${PRINCIPAL}` }, 401),
            },
            REF,
            'backend_refused',
        ],
        [
            'a 200 outside the contract',
            {
                components: { cmp_data: DATASET_FRAME },
                refreshFrame: () => json({ status: 'moved' }),
            },
            REF,
            'backend_invalid',
        ],
        [
            'a redraw that names no frame',
            {
                components: { cmp_derived: DERIVED_FRAME },
                refreshDerived: () => {
                    const render = renderReply('cmp_derived', 2, REPLAYED_FRAME);

                    render['resolved_payload'].provenance.inputs = [];

                    return aiRedrawn(render);
                },
            },
            DERIVED_REF,
            'backend_invalid',
        ],
        [
            'dfo-apis unreachable',
            { components: { cmp_data: DATASET_FRAME }, refreshFrame: down },
            REF,
            'backend_unreachable',
        ],
        [
            'dfo-ai times out',
            { components: { cmp_derived: DERIVED_FRAME }, refreshDerived: timedOut },
            DERIVED_REF,
            'backend_timeout',
        ],
    ];

    for (const [name, script, ref, code] of cases) {
        const { backend } = backendOver(script);

        assert.deepEqual(await refreshCard(backend, ref), { status: 'error', code }, name);
    }
});

test('a stored ref outside the service’s id form is a missing ref and reaches no URL', async () => {
    const refs = [
        { component_id: '..', revision: 1 },
        { component_id: '.', revision: 1 },
        { component_id: 'cmp_a/../b', revision: 1 },
        { component_id: 'cmp_a?x=1', revision: 1 },
        { component_id: 'cmp_', revision: 1 },
        { component_id: `cmp_${'a'.repeat(65)}`, revision: 1 },
        { component_id: 'cmp_ok', revision: 0 },
        { component_id: 'cmp_ok', revision: 1.5 },
    ];

    for (const ref of refs) {
        const { stub, backend } = backendOver({
            components: { [ref.component_id]: DATASET_FRAME },
        });

        // Creating the share refuses the card before any read.
        assert.deepEqual(
            await liveShareRefusal({ env: ENV, fetch: stub.fetch }, canvas([chart('c', ref)])),
            {
                status: 400,
                body: { error: 'live_cards_blocked', cards: [{ id: 'c', reason: 'missing_ref' }] },
            },
            JSON.stringify(ref),
        );

        // And no call of the client puts it in a path, with or without a credential.
        const frame = DATASET_FRAME;
        const calls = [
            readComponent(backend, ref),
            renderOnFrame(backend, ref, frame),
            renderedExport(backend, ref, frame, {}),
            storedExport(backend, ref, {}),
        ];

        for (const call of calls) {
            await assert.rejects(
                call,
                (error) => error instanceof BackendError && error.code === 'request_invalid',
            );
        }

        assert.equal(stub.calls.length, 0, JSON.stringify(ref));
    }
});

test('liveSharingAvailable: only with a non-empty credential', () => {
    assert.equal(liveSharingAvailable(ENV), true);
    assert.equal(liveSharingAvailable({ ...ENV, LIVE_REFRESH_PRINCIPAL: '' }), false);
    assert.equal(liveSharingAvailable({ ...ENV, LIVE_REFRESH_PRINCIPAL: '  ' }), false);
    assert.equal(liveSharingAvailable({ SEARCH_API_BASE: APIS }), false);
});

test('liveShareRefusal: a canvas whose data cards all resolve can be live', async () => {
    const stub = stubBackend({
        components: { cmp_data: DATASET_FRAME, cmp_derived: DERIVED_FRAME },
    });
    const saved = canvas(
        [
            chart('a', REF),
            chart('b', DERIVED_REF),
            { kind: 'text', id: 'note', title: 'Note', body: 'Body' },
            // A card removed from the canvas is not shown, so it is not checked.
            chart('gone'),
        ],
        ['gone'],
    );

    assert.equal(await liveShareRefusal({ env: ENV, fetch: stub.fetch }, saved), null);
    // The check reads each component and runs no refresh.
    assert.deepEqual(stub.calls.map((call) => call.path).sort(), [
        '/api/presentation/components/cmp_data',
        '/api/presentation/components/cmp_derived',
    ]);
});

test('liveShareRefusal: names every card that blocks a live link', async () => {
    const stub = stubBackend({
        components: {
            cmp_data: DATASET_FRAME,
            cmp_odd: { spec_id: 'frm_1', content_version: 'cv' },
        },
    });
    const saved = canvas([
        chart('fine', REF),
        chart('no-ref'),
        chart('unknown', { component_id: 'cmp_missing', revision: 1 }),
        chart('odd-frame', { component_id: 'cmp_odd', revision: 1 }),
    ]);

    assert.deepEqual(await liveShareRefusal({ env: ENV, fetch: stub.fetch }, saved), {
        status: 400,
        body: {
            error: 'live_cards_blocked',
            cards: [
                { id: 'no-ref', reason: 'missing_ref' },
                { id: 'unknown', reason: 'unknown_component' },
                { id: 'odd-frame', reason: 'unsupported_frame' },
            ],
        },
    });
});

test('liveShareRefusal: holds at most four component reads in flight', async () => {
    // dfo-apis answers a fifth concurrent read on the component door with an
    // immediate 503, so a stub that refuses the same way fails a wider check.
    const stub = stubBackend({ components: { cmp_data: DATASET_FRAME } });
    let inFlight = 0;
    let peak = 0;
    const gated: typeof fetch = async (input, init) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);

        try {
            await new Promise((resolve) => setTimeout(resolve, 2));

            return inFlight > 4
                ? json({ code: 'service_unavailable' }, 503)
                : await stub.fetch(input, init);
        } finally {
            inFlight -= 1;
        }
    };
    const cards = Array.from({ length: 12 }, (_, index) => chart(`card-${index}`, REF));

    assert.equal(await liveShareRefusal({ env: ENV, fetch: gated }, canvas(cards)), null);
    assert.equal(stub.calls.length, 12);
    assert.ok(peak > 1 && peak <= 4, `peak ${peak}`);
});

test('liveShareRefusal: more data cards than the cap, before any read', async () => {
    const stub = stubBackend({ components: { cmp_data: DATASET_FRAME } });
    const count = LIVE_SHARE_MAX_DATA_CARDS + 1;
    const cards = Array.from({ length: count }, (_, index) => chart(`card-${index}`, REF));

    assert.deepEqual(await liveShareRefusal({ env: ENV, fetch: stub.fetch }, canvas(cards)), {
        status: 400,
        body: { error: 'live_too_many_cards', limit: LIVE_SHARE_MAX_DATA_CARDS, count },
    });
    assert.equal(stub.calls.length, 0);
    assert.equal(
        await liveShareRefusal({ env: ENV, fetch: stub.fetch }, canvas(cards.slice(1))),
        null,
    );
});

test('liveShareRefusal: counts and checks only the cards the canvas shows', async () => {
    const stub = stubBackend({ components: { cmp_data: DATASET_FRAME } });
    const turn = (number: number, count: number) =>
        Array.from({ length: count }, (_, index) => ({
            ...chart(`turn${number}-${index}`, REF),
            turn: number,
        }));
    const saved: SavedConversation = {
        ...canvas([]),
        widgets: [...turn(1, 11), ...turn(2, 11)],
        turnCount: 2,
    };

    // The canvas shows the latest turn's 11 cards, under the cap.
    assert.equal(await liveShareRefusal({ env: ENV, fetch: stub.fetch }, saved), null);

    // A pinned card from the earlier turn is on the canvas, so it is checked;
    // an unpinned one is not.
    const withPinned: SavedConversation = {
        ...saved,
        widgets: [
            ...saved.widgets,
            { ...chart('pinned-no-ref'), turn: 1 },
            { ...chart('gone-no-ref'), turn: 1 },
        ],
        pinnedIds: ['pinned-no-ref'],
    };

    assert.deepEqual(await liveShareRefusal({ env: ENV, fetch: stub.fetch }, withPinned), {
        status: 400,
        body: {
            error: 'live_cards_blocked',
            cards: [{ id: 'pinned-no-ref', reason: 'missing_ref' }],
        },
    });
});

test('liveShareRefusal: no credential, or a back end that cannot answer', async () => {
    const stub = stubBackend({ components: { cmp_data: DATASET_FRAME } });
    const saved = canvas([chart('a', REF)]);

    assert.deepEqual(
        await liveShareRefusal(
            { env: { ...ENV, LIVE_REFRESH_PRINCIPAL: '' }, fetch: stub.fetch },
            saved,
        ),
        { status: 503, body: { error: 'live_unavailable' } },
    );
    assert.equal(stub.calls.length, 0);

    const down: typeof fetch = async () => {
        throw new TypeError('fetch failed');
    };

    assert.deepEqual(await liveShareRefusal({ env: ENV, fetch: down }, saved), {
        status: 502,
        body: { error: 'live_check_failed' },
    });
});

test('liveWindowSeconds: 300 by default, the override capped at 900', () => {
    assert.equal(liveWindowSeconds({}), 300);
    assert.equal(liveWindowSeconds({ LIVE_SHARE_WINDOW_S: '60' }), 60);
    assert.equal(liveWindowSeconds({ LIVE_SHARE_WINDOW_S: '3600' }), 900);

    for (const bad of ['0', '-5', 'soon', '']) {
        assert.equal(liveWindowSeconds({ LIVE_SHARE_WINDOW_S: bad }), 300, bad);
    }
});

test('pendingSeconds: the named wait, held between 2 and 60 seconds', () => {
    assert.equal(pendingSeconds(8), 8);
    assert.equal(pendingSeconds(0), 2);
    assert.equal(pendingSeconds(2.2), 3);
    assert.equal(pendingSeconds(600), 60);
    assert.equal(pendingSeconds(null), 5);
});
