/**
 * The live share client against the recording of dfo-apis' live-refresh
 * routes (`fixtures/wire-pairs.json`): every request the client sends is one
 * the recording holds, and every recorded answer becomes the card, frame,
 * wait, or code the site derives from it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChartWidget, FrameRef } from '../../chat/widgets.ts';
import {
    BackendError,
    liveBackendFrom,
    readComponent,
    refreshFrame,
    renderedExport,
    renderOnFrame,
    type LiveBackend,
} from '../liveBackend.ts';
import { refreshCard } from '../liveShare.ts';
import { liveFailureKind, widgetFromLiveCard } from '../liveCards.ts';
import { pendingSeconds } from '../liveShareResults.ts';
import { aiRedrawn, DERIVED_FRAME, ENV, json, PRINCIPAL, stubBackend } from './fixtures/live-backend-stub.ts';
import { bodyOf, frameOfAnswer, PAIR_NAMES, pairOf, replayOf } from './fixtures/recorded-wire.ts';

const DATASET_REF = { component_id: 'cmp_000000000000000000000001', revision: 1 };
const DERIVED_REF = { component_id: 'cmp_000000000000000000000002', revision: 1 };

const CARD_FLOW = ['component_read.at_revision', 'render.dataset_card'];

const backendOver = (fetcher: typeof fetch) => liveBackendFrom(ENV, fetcher) as LiveBackend;

const replay = (names: string[], lenient: string[] = []) => {
    const replayed = replayOf(names, { principal: PRINCIPAL, lenient });

    return { replayed, backend: backendOver(replayed.fetch) };
};

const framePair = (frame: { spec_id: string; content_version: string }) => frame;

test('a dataset card whose data moved is read, checked, and rendered with recorded requests', async () => {
    const { replayed, backend } = replay([...CARD_FLOW, 'frame_refresh.moved']);
    const result = await refreshCard(backend, DATASET_REF);
    const rendered = bodyOf('render.dataset_card');
    const drawn = rendered['resolved_payload'].provenance.inputs[0];

    assert.deepEqual(replayed.unrecorded, []);
    assert.deepEqual(
        replayed.calls.map(({ method, path }) => `${method} ${path.split('?')[0]}`),
        [
            'GET /api/presentation/components/cmp_000000000000000000000001',
            'POST /api/datasets/frames/refresh',
            'POST /api/presentation/components/cmp_000000000000000000000001/revisions/1/render',
        ],
    );
    // The frame recorded for the card is the one its envelope was drawn on,
    // which the render's own `stored_intent` does not name.
    assert.notDeepEqual(rendered['stored_intent'].frame_ref, drawn);
    assert.deepEqual(result, {
        status: 'redrawn',
        frame: drawn,
        card: {
            component_id: rendered['component_id'],
            revision: rendered['revision'],
            payload: rendered['resolved_payload'],
            fact_summary: rendered['fact_summary'],
        },
    });
    assert.deepEqual(drawn, frameOfAnswer('frame_refresh.moved'));
});

test('a dataset card whose frame stands is the stored revision’s read', async () => {
    const { replayed, backend } = replay(['component_read.at_revision', 'frame_refresh.current']);
    const read = bodyOf('component_read.at_revision');

    assert.deepEqual(await refreshCard(backend, DATASET_REF), {
        status: 'current',
        card: {
            component_id: read['component_id'],
            revision: read['revision'],
            payload: read['resolved_payload'],
            fact_summary: read['fact_summary'],
        },
    });
    assert.deepEqual(replayed.unrecorded, []);
});

test('a queued rebuild answers a fractional wait, which the site holds as whole seconds', async () => {
    const { replayed, backend } = replay(['component_read.at_revision', 'frame_refresh.pending']);
    const recorded = bodyOf('frame_refresh.pending')['retry_after_s'];

    assert.equal(recorded, 1.5);
    assert.deepEqual(await refreshFrame(backend, frameOfAnswer('frame_refresh.current')), {
        status: 'pending',
        retryAfterS: 1.5,
    });
    assert.deepEqual(await refreshCard(backend, DATASET_REF), {
        status: 'pending',
        retryAfterS: 2,
    });
    assert.deepEqual(replayed.unrecorded, []);

    // Rounded up, then held between 2 and 60.
    assert.deepEqual([0.4, 1.5, 2, 2.2, 59.2, 61.5].map(pendingSeconds), [2, 2, 2, 3, 60, 60]);
});

test('a dataset card is stored on the frame its render’s envelope names, not the one asked for', async () => {
    const rendered = bodyOf('render.dataset_card');
    const drawn = { ...frameOfAnswer('frame_refresh.moved'), content_version: 'cv_drawn' };

    rendered['resolved_payload'].provenance.inputs = [drawn];

    const stub = stubBackend({
        components: { [DATASET_REF.component_id]: frameOfAnswer('frame_refresh.current') },
        refreshFrame: () => json(bodyOf('frame_refresh.moved')),
        render: () => json(rendered),
    });
    const result = await refreshCard(backendOver(stub.fetch), DATASET_REF);

    assert.equal(result.status, 'redrawn');
    assert.deepEqual(result.status === 'redrawn' && result.frame, drawn);
});

test('a derived card redrawn by dfo-ai is stored on the frame its render’s envelope names', async () => {
    const rendered = bodyOf('render.derived_card_with_anchor_warning');
    const stub = stubBackend({
        components: { [DERIVED_REF.component_id]: DERIVED_FRAME },
        refreshDerived: () => aiRedrawn(rendered),
    });
    const result = await refreshCard(backendOver(stub.fetch), DERIVED_REF);
    const drawn = rendered['resolved_payload'].provenance.inputs[0];

    assert.deepEqual(result, {
        status: 'redrawn',
        frame: drawn,
        card: {
            component_id: rendered['component_id'],
            revision: rendered['revision'],
            payload: rendered['resolved_payload'],
            fact_summary: rendered['fact_summary'],
        },
    });
    // The replayed frame has its own `spec_id`, and the stored intent still
    // names the old one.
    assert.notEqual(drawn.spec_id, rendered['stored_intent'].frame_ref.spec_id);
    assert.deepEqual(rendered['stored_intent'].frame_ref, DERIVED_FRAME);
});

test('a render that names no frame in its envelope is not a redrawn card', async () => {
    for (const mutate of [
        (body: ReturnType<typeof bodyOf>) => delete body['resolved_payload'].provenance.inputs,
        (body: ReturnType<typeof bodyOf>) => (body['resolved_payload'].provenance.inputs = []),
        (body: ReturnType<typeof bodyOf>) => delete body['resolved_payload'],
    ]) {
        const rendered = bodyOf('render.derived_card_with_anchor_warning');

        mutate(rendered);

        const stub = stubBackend({
            components: { [DERIVED_REF.component_id]: DERIVED_FRAME },
            refreshDerived: () => aiRedrawn(rendered),
        });

        assert.deepEqual(await refreshCard(backendOver(stub.fetch), DERIVED_REF), {
            status: 'error',
            code: 'backend_invalid',
        });
    }
});

// Each recorded refusal, sent by the client function that makes the request,
// with the code the viewer is given and what the code says about asking
// again. `refresh_not_permitted` is recorded for a request with no
// credential, which the client never sends, so it matches on the rest.
// The body of a recorded refusal's request: a frame, or a render's `{frame}`.
type Sent = FrameRef & { frame: FrameRef };

const REFUSALS: [string, (backend: LiveBackend, body: Sent) => Promise<unknown>, string, string][] =
    [
        [
            'frame_refresh.refresh_not_permitted',
            (backend, body) => refreshFrame(backend, body),
            'refresh_not_permitted',
            'permanent',
        ],
        [
            'frame_refresh.frame_not_refreshable',
            (backend, body) => refreshFrame(backend, body),
            'frame_not_refreshable',
            'permanent',
        ],
        [
            'frame_refresh.rendering_not_recorded',
            (backend, body) => refreshFrame(backend, body),
            'rendering_not_recorded',
            'permanent',
        ],
        [
            'render.render_target_mismatch',
            (backend, body) => renderOnFrame(backend, DATASET_REF, body.frame),
            'render_target_mismatch',
            'permanent',
        ],
    ];

test('each recorded refusal reaches the viewer as its recorded code', async () => {
    for (const [name, send, code, kind] of REFUSALS) {
        const { replayed, backend } = replay([name], [name]);
        const { status, body } = pairOf(name).response;
        const failure = await send(backend, pairOf(name).request.body as Sent).catch((error) => error);

        assert.ok(failure instanceof BackendError, name);
        assert.equal(failure.code, body?.['code'], name);
        assert.equal(failure.code, code, name);
        assert.equal(failure.status, status, name);
        assert.equal(failure.retryable, body?.['retryable'], name);
        assert.equal(liveFailureKind(failure), kind, name);
        assert.deepEqual(replayed.unrecorded, [], name);
        // Nothing of the refusal beyond its code and status leaves the client.
        assert.ok(!JSON.stringify(failure).includes(String(body?.['detail'])), name);
    }
});

test('a refusal of the render in a card’s refresh is that card’s error answer', async () => {
    const mismatch = 'render.render_target_mismatch';
    const stub = stubBackend({
        components: { [DATASET_REF.component_id]: frameOfAnswer('frame_refresh.current') },
        refreshFrame: () => json(bodyOf('frame_refresh.moved')),
        render: () =>
            new Response(JSON.stringify(bodyOf(mismatch)), {
                status: pairOf(mismatch).response.status,
                headers: pairOf(mismatch).response.headers,
            }),
    });

    assert.deepEqual(await refreshCard(backendOver(stub.fetch), DATASET_REF), {
        status: 'error',
        code: 'render_target_mismatch',
    });
});

// dfo-apis' retry_after_delay and refresh_then_retry refusals say `retryable:
// true` in the problem body. The site believes the body, so a rollout's
// `release_mismatch` or `frame_unavailable` is a failure that clears, not a
// card that can never refresh.
test('a recorded refusal made retryable stays a retryable error through the card refresh', async () => {
    const mismatch = 'render.render_target_mismatch';
    const codes: [string, number][] = [
        ['release_mismatch', 409],
        ['frame_unavailable', 409],
        ['edit_conflict', 409],
        ['service_unavailable', 503],
        ['timeout', 504],
    ];

    for (const [code, status] of codes) {
        for (const retryable of [true, false]) {
            const stub = stubBackend({
                components: { [DATASET_REF.component_id]: frameOfAnswer('frame_refresh.current') },
                refreshFrame: () => json(bodyOf('frame_refresh.moved')),
                render: () =>
                    new Response(JSON.stringify({ ...bodyOf(mismatch), code, status, retryable }), {
                        status,
                        headers: pairOf(mismatch).response.headers,
                    }),
            });
            const result = await refreshCard(backendOver(stub.fetch), DATASET_REF);

            assert.equal(result.status, 'error');
            assert.equal(result.status === 'error' && result.code, code);
            assert.equal(
                result.status === 'error' && liveFailureKind(result),
                retryable ? 'transient' : 'permanent',
                `${code} retryable=${retryable}`,
            );
        }
    }
});

test('the render data export is the recorded request, and its file is passed on', async () => {
    const frame = frameOfAnswer('frame_refresh.moved');
    const cases: [string, Record<string, string>][] = [
        ['render_data.csv', { format: 'csv', bundle: 'false' }],
        ['render_data.bundle', {}],
    ];

    for (const [name, options] of cases) {
        const { replayed, backend } = replay([name]);
        const res = await renderedExport(backend, DATASET_REF, frame, options);
        const { headers, body_starts, body_starts_hex } = pairOf(name).response;
        const bytes = Buffer.from(await res.arrayBuffer());

        assert.deepEqual(replayed.unrecorded, [], name);
        assert.equal(res.headers.get('content-type'), headers['content-type'], name);
        assert.equal(res.headers.get('content-disposition'), headers['content-disposition'], name);
        assert.ok(
            body_starts !== undefined
                ? bytes.toString().startsWith(body_starts)
                : bytes.toString('hex').startsWith(body_starts_hex!),
            name,
        );
    }
});

test('the component read is the recorded request with no header', async () => {
    const { replayed, backend } = replay(['component_read.at_revision']);
    const read = await readComponent(backend, DATASET_REF);

    assert.deepEqual(replayed.unrecorded, []);
    assert.deepEqual([...replayed.calls[0]!.headers], []);
    assert.deepEqual(read.frame, bodyOf('component_read.at_revision')['stored_intent'].frame_ref);
    assert.deepEqual(read.card.payload, bodyOf('component_read.at_revision')['resolved_payload']);
});

// The recording also holds the recipe, replay, and version routes that
// dfo-ai calls. The site calls none of them.
const NOT_CALLED_BY_THE_SITE = [
    'publish.with_recipe',
    'recipe_read.found',
    'recipe_read.recipe_not_found',
    'replay_lookup.found',
    'replay_lookup.recipe_not_found',
    'versions_list',
];

test('every recorded pair is either exercised by these tests or one the site never sends', () => {
    const exercised = [
        'component_read.at_revision',
        'frame_refresh.current',
        'frame_refresh.moved',
        'frame_refresh.pending',
        'render.dataset_card',
        'render.derived_card_with_anchor_warning',
        'render_data.csv',
        'render_data.bundle',
        ...REFUSALS.map(([name]) => name),
    ];

    assert.deepEqual(
        PAIR_NAMES.filter((name) => ![...exercised, ...NOT_CALLED_BY_THE_SITE].includes(name)),
        [],
    );
});

// --- The cards the browser draws --------------------------------------------

const heldChart = (ref: { component_id: string; revision: number }): ChartWidget => ({
    kind: 'chart',
    id: ref.component_id,
    chartType: 'line',
    title: '',
    categories: [],
    series: [],
    ref,
});

const answerCard = (name: string) => {
    const body = bodyOf(name);

    return {
        component_id: body['component_id'],
        revision: body['revision'],
        payload: body['resolved_payload'],
        fact_summary: body['fact_summary'],
    };
};

test('the recorded dataset card is drawn on the frame it was rendered on', () => {
    const widget = widgetFromLiveCard(heldChart(DATASET_REF), answerCard('render.dataset_card'));

    assert.ok(widget && widget.kind === 'chart');
    assert.equal(widget.title, 'Grants');
    assert.deepEqual(widget.categories, ['2022', '2023', '2024', '2025']);
    assert.deepEqual(
        widget.series.map(({ label, values }) => [label, values]),
        [
            ['Kenya', [200, 210, 220, 230]],
            ['Ghana', [100, 110, 120, 130]],
        ],
    );
    assert.deepEqual(widget.ref, DATASET_REF);
    assert.deepEqual(widget.frame, frameOfAnswer('frame_refresh.moved'));
    assert.equal(widget.source, 'OECD_DAC2A');
    assert.equal(widget.info?.sourceName, 'OECD_DAC2A');
    assert.equal(widget.info?.sourceCount, 1);
    assert.equal(widget.info?.indicatorCount, 1);
    assert.deepEqual(widget.info?.years, { start: '2022', end: '2025' });
    assert.equal(
        widget.info?.citation,
        bodyOf('render.dataset_card').resolved_payload.provenance.citation,
    );
    // Its warnings are provisional notes, which leave nothing out.
    assert.ok(!('leftOut' in widget.info!));
});

test('the recorded derived card states what it left out, in the platform’s words', () => {
    const rendered = bodyOf('render.derived_card_with_anchor_warning');
    const widget = widgetFromLiveCard(
        heldChart(DERIVED_REF),
        answerCard('render.derived_card_with_anchor_warning'),
    );
    const gaps = rendered['resolved_payload'].provenance.warnings
        .filter(({ kind }: { kind: string }) => kind === 'coverage_gap')
        .map(({ detail }: { detail: string }) => detail);

    assert.ok(widget && widget.kind === 'chart');
    assert.equal(gaps.length, 1);
    // The card's left-out line and its More Info "Left out" list both read
    // `info.leftOut`.
    assert.deepEqual(widget.info?.leftOut, gaps);
    assert.deepEqual(widget.frame, framePair(rendered['resolved_payload'].provenance.inputs[0]));
    assert.deepEqual(widget.categories, ['2024', '2025']);
    assert.deepEqual(widget.ref, DERIVED_REF);
});
