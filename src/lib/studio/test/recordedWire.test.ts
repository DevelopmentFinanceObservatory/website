/**
 * The site's component read against the recording of dfo-apis' live-refresh
 * routes (`fixtures/wire-pairs.json`): the read the client sends is one the
 * recording holds, a recorded refusal becomes its code, and the recorded
 * cards draw as the browser shows them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChartWidget } from '../../chat/widgets.ts';
import { BackendError, readComponent, type LiveBackend } from '../liveBackend.ts';
import { liveFailureKind, widgetFromLiveCard } from '../liveCards.ts';
import {
    bodyOf,
    frameOfAnswer,
    PAIR_NAMES,
    pairOf,
    replayOf,
    responseOf,
} from './fixtures/recorded-wire.ts';

const DATASET_REF = { component_id: 'cmp_000000000000000000000001', revision: 1 };
const DERIVED_REF = { component_id: 'cmp_000000000000000000000002', revision: 1 };

const backendOver = (fetcher: typeof fetch): LiveBackend => ({
    apisBase: 'https://recorded.example',
    fetch: fetcher,
});

test('the component read is the recorded request with no header', async () => {
    const replayed = replayOf(['component_read.at_revision']);
    const read = await readComponent(backendOver(replayed.fetch), DATASET_REF);

    assert.deepEqual(replayed.unrecorded, []);
    assert.deepEqual([...replayed.calls[0]!.headers], []);
    assert.deepEqual(read.frame, bodyOf('component_read.at_revision')['stored_intent'].frame_ref);
    assert.deepEqual(read.card.payload, bodyOf('component_read.at_revision')['resolved_payload']);
});

// dfo-apis' recorded problem bodies, each answered to the component read.
// Every route refuses in this shape.
const REFUSALS: [string, string][] = [
    ['frame_refresh.refresh_not_permitted', 'refresh_not_permitted'],
    ['frame_refresh.frame_not_refreshable', 'frame_not_refreshable'],
    ['frame_refresh.rendering_not_recorded', 'rendering_not_recorded'],
    ['render.render_target_mismatch', 'render_target_mismatch'],
];

test('each recorded refusal reaches the caller as its recorded code', async () => {
    for (const [name, code] of REFUSALS) {
        const backend = backendOver(async () => responseOf(name));
        const { status, body } = pairOf(name).response;
        const failure = await readComponent(backend, DATASET_REF).catch((error) => error);

        assert.ok(failure instanceof BackendError, name);
        assert.equal(failure.code, body?.['code'], name);
        assert.equal(failure.code, code, name);
        assert.equal(failure.status, status, name);
        assert.equal(failure.retryable, body?.['retryable'], name);
        assert.equal(liveFailureKind(failure), 'permanent', name);
        // Nothing of the refusal beyond its code and status leaves the client.
        assert.ok(!JSON.stringify(failure).includes(String(body?.['detail'])), name);
    }
});

// The recording also holds the frame refresh, render, and export routes, and
// the recipe, replay, and version routes that dfo-ai calls. The site sends
// none of them.
const NOT_CALLED_BY_THE_SITE = [
    'frame_refresh.current',
    'frame_refresh.frame_not_refreshable',
    'frame_refresh.moved',
    'frame_refresh.pending',
    'frame_refresh.refresh_not_permitted',
    'frame_refresh.rendering_not_recorded',
    'publish.with_recipe',
    'recipe_read.found',
    'recipe_read.recipe_not_found',
    'render.dataset_card',
    'render.derived_card_with_anchor_warning',
    'render.render_target_mismatch',
    'render_data.bundle',
    'render_data.csv',
    'replay_lookup.found',
    'replay_lookup.recipe_not_found',
    'versions_list',
];

test('every recorded pair is either sent by the site or listed as not sent', () => {
    const sent = ['component_read.at_revision'];

    assert.deepEqual(
        PAIR_NAMES.filter((name) => ![...sent, ...NOT_CALLED_BY_THE_SITE].includes(name)),
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
    assert.deepEqual(widget.frame, rendered['resolved_payload'].provenance.inputs[0]);
    assert.deepEqual(widget.categories, ['2024', '2025']);
    assert.deepEqual(widget.ref, DERIVED_REF);
});
