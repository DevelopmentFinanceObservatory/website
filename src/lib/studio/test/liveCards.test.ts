/**
 * `liveCards.ts`: what a share page hands the browser (a snapshot's stored
 * copy as it is, a live share's with its data cards held), how the browser
 * asks the refresh route for each card, and how an answer is drawn onto a
 * held card.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConversation } from '../../chat/history.ts';
import type { Widget } from '../../chat/widgets.ts';
import type { LiveCard, LiveFactSummary } from '../liveBackend.ts';
import {
    cardLiveOf,
    cardsToFill,
    isLiveCanvas,
    LIVE_CLIENT_CODES,
    LIVE_REFRESH_CONCURRENCY,
    liveCardFailure,
    leftOutOf,
    liveFailureKind,
    type LiveCardOutcome,
    type LiveDeps,
    liveNote,
    refreshLiveCards,
    sharedViewOf,
    widgetFromLiveCard,
} from '../liveCards.ts';
import { widgetFromComponent } from '../widgets.ts';
import type { ComponentCreated, ComponentType, FactSummary } from '../wire.ts';
import { bodyOf } from './fixtures/recorded-wire.ts';

const SOURCE = 'src_oecd_crs_1a2b3c4d';

const factsOf = (label: string): FactSummary => ({
    component_id: 'cmp_test',
    revision: 1,
    series: [{ id: 's_a', label: 'Germany', point_count: 2, first: 1, last: 2 }],
    attribution: { label, source_count: 1, indicator_count: 1 },
    window: { start: '2022', end: '2023' },
    // The unit text dfo-apis' recorded summary gives (`liveFacts`).
    unit: 'USD',
});

const envelope = (
    id: string,
    revision: number,
    version: string,
    component: Record<string, unknown>,
) => ({
    schema_version: 1,
    catalog_version: '2026.10.0',
    component_id: id,
    revision,
    provenance: {
        inputs: [{ spec_id: 'spec_oda', content_version: version }],
        sources: [{ id: SOURCE, name: 'OECD CRS', licence: 'CC BY 4.0' }],
        freshness: { data_through: version, last_refreshed: version, partial_period: false },
        warnings: [],
        citation: `OECD CRS via ONE DFO, ${version}`,
    },
    component,
});

const title = (text: string) => ({ text, authorship: 'model' });

const series = (label: string, values: number[]) => ({
    id: `s_${label.toLowerCase()}`,
    label,
    unit: 'USD',
    source_ref: SOURCE,
    points: values.map((value, index) => ({ period: String(2022 + index), value })),
});

const chart = (heading: string, values: number[]) => ({
    type: 'line_chart',
    title: title(heading),
    series: [series('Germany', values)],
    x_axis: { window: { start: '2022', end: '2023' } },
});

const stat = (heading: string, value: number) => ({
    type: 'stat_card',
    title: title(heading),
    value,
    label: 'Germany',
    period: '2023',
    unit: 'USD',
});

const table = (heading: string, value: number) => ({
    type: 'table',
    title: title(heading),
    columns: [
        { key: 'donor', label: 'Donor' },
        { key: 'value', label: 'Value' },
    ],
    rows: [
        {
            series_id: 's_x',
            dimensions: { donor: 'Germany' },
            period: '2023',
            source_ref: SOURCE,
            unit: 'USD',
            value,
        },
    ],
});

// One card as the platform sends it, at a revision and a data version.
const created = (
    id: string,
    revision: number,
    version: string,
    component: Record<string, unknown>,
    attribution: string,
): ComponentCreated => ({
    event: 'component.created',
    seq: 1,
    component_id: id,
    revision,
    type: component['type'] as ComponentType,
    catalog_version: '2026.10.0',
    min_catalog_version: '2026.10.0',
    payload: envelope(id, revision, version, component),
    fact_summary: factsOf(attribution),
    provenance: {
        inputs: [{ spec_id: 'spec_oda', content_version: version }],
        sources: [{ id: SOURCE, name: 'OECD CRS', licence: 'CC BY 4.0' }],
        freshness: { data_through: version, last_refreshed: version, partial_period: false },
        warnings: [],
        generated_at: '2026-10-03T00:00:00Z',
        citation: `OECD CRS via ONE DFO, ${version}`,
    },
});

// dfo-apis' fact summary as recorded, for the window `factsOf` gives these
// cards: one StatVar, its series labelled by recipient.
const liveFacts = (): LiveFactSummary => ({
    ...bodyOf('component_read.at_revision')['fact_summary'],
    window: { start: '2022', end: '2023' },
});

const liveCardOf = ({ component_id, revision, payload }: ComponentCreated): LiveCard => ({
    component_id,
    revision,
    payload,
    fact_summary: liveFacts(),
});

const drawn = (frame: ComponentCreated): Widget => {
    const widget = widgetFromComponent(frame);

    assert.ok(widget);

    return widget;
};

// What each card showed when the share was made. Every stored title, value
// and date is distinct from what `CURRENT` holds.
const STORED = {
    cmp_chart: created(
        'cmp_chart',
        1,
        '2026-01-11',
        chart('Stored chart', [41_111, 42_222]),
        'Stored attribution',
    ),
    cmp_stat: created(
        'cmp_stat',
        1,
        '2026-01-11',
        stat('Stored stat', 43_333),
        'Stored attribution',
    ),
    cmp_table: created(
        'cmp_table',
        1,
        '2026-01-11',
        table('Stored table', 44_444),
        'Stored attribution',
    ),
};

const CURRENT = {
    cmp_chart: created(
        'cmp_chart',
        1,
        '2026-09-30',
        chart('Current chart', [51_111, 52_222]),
        'Current attribution',
    ),
    cmp_stat: created(
        'cmp_stat',
        1,
        '2026-09-30',
        stat('Current stat', 53_333),
        'Current attribution',
    ),
    cmp_table: created(
        'cmp_table',
        1,
        '2026-09-30',
        table('Current table', 54_444),
        'Current attribution',
    ),
};

const STORED_MARKS = ['Stored', '41111', '42222', '43333', '44444', '2026-01-11'];

const NOTE: Widget = { kind: 'text', id: 'cmp_note', title: 'A note', body: 'Written 41,111 once' };

const saved: SavedConversation = {
    id: 'conv_1',
    sessionId: null,
    title: 'Aid to Ghana',
    updatedAt: 1,
    messages: [],
    widgets: [...Object.values(STORED).map(drawn), NOTE].map((widget) => ({ ...widget, turn: 2 })),
    turnCount: 2,
    pinnedIds: ['cmp_chart'],
    removedIds: [],
    layout: { cmp_chart: { col: 3, row: 4, w: 22, h: 14 } },
    views: { cmp_chart: 'chart-table' },
    textCards: [{ kind: 'text', id: 'text-1', title: 'My text', body: 'Stored words stay' }],
    titles: { cmp_stat: 'My own title' },
    notes: { cmp_stat: 'My note' },
};

const row = (kind: string, mode: string | null) => ({
    id: 'Ab12Cd34',
    kind,
    mode,
    data: saved,
    createdAt: new Date('2026-10-01T09:30:00Z'),
});

test('a snapshot share reaches the client as the stored copy itself', () => {
    for (const snapshot of [
        row('canvas', 'snapshot'),
        row('card', null),
        row('conversation', 'live'),
    ]) {
        const view = sharedViewOf(snapshot);

        assert.equal(view.saved, saved);
        assert.equal(view.live, false);
    }
});

test('a live share reaches the client with no data card value, title, source or date', () => {
    const view = sharedViewOf(row('canvas', 'live'));
    const cards = view.saved.widgets.filter((widget) => widget.kind !== 'text');

    assert.equal(view.live, true);
    assert.equal(view.id, 'Ab12Cd34');
    assert.equal(view.createdAt, '2026-10-01T09:30:00.000Z');

    const shipped = JSON.stringify(cards);

    for (const mark of STORED_MARKS) {
        assert.ok(!shipped.includes(mark), `held cards carry "${mark}": ${shipped}`);
    }

    assert.deepEqual(cards, [
        {
            kind: 'chart',
            id: 'cmp_chart',
            turn: 2,
            chartType: 'line',
            title: '',
            categories: [],
            series: [],
            ref: { component_id: 'cmp_chart', revision: 1 },
        },
        {
            kind: 'key_number',
            id: 'cmp_stat',
            turn: 2,
            label: '',
            value: '',
            ref: { component_id: 'cmp_stat', revision: 1 },
        },
        {
            kind: 'table',
            id: 'cmp_table',
            turn: 2,
            title: '',
            columns: [],
            rows: [],
            ref: { component_id: 'cmp_table', revision: 1 },
        },
    ]);
});

test("a live share keeps the user's text, notes, titles, views, layout and pins as stored", () => {
    const { saved: held } = sharedViewOf(row('card', 'live'));
    const { widgets, ...rest } = held;
    const { widgets: storedWidgets, ...storedRest } = saved;

    assert.deepEqual(rest, storedRest);
    assert.deepEqual(widgets.at(-1), storedWidgets.at(-1));
});

test('a held card is drawn from the answer alone, whatever the share stored', () => {
    const held = sharedViewOf(row('canvas', 'live')).saved.widgets;

    for (const [id, current] of Object.entries(CURRENT)) {
        const answer = { ...liveCardOf(current), revision: 4 };
        const widget = widgetFromLiveCard(
            held.find((card) => card.id === id)!,
            answer,
        );
        // A card the platform creates from the same answer shows the same
        // thing, except that dfo-apis' fact summary has no attribution, so
        // the source is the envelope's own source name. The unit is dfo-apis'.
        const created = { ...drawn({ ...current, revision: 4 }), turn: 2 };
        const expected = {
            ...created,
            source: 'OECD CRS',
            info: { ...created.info!, label: 'OECD CRS' },
        };

        assert.deepEqual(widget, expected);
        assert.ok(widget?.info?.unit);
        assert.ok(!STORED_MARKS.some((mark) => JSON.stringify(widget).includes(mark)));
    }
});

test('a held card takes the kind of the component its slot serves', () => {
    // A share made through the Presentation API holds each slot as a table,
    // and an owner's replace can put another kind of card in a slot.
    const [heldChart] = sharedViewOf(row('canvas', 'live')).saved.widgets;
    const stat = widgetFromLiveCard(heldChart!, liveCardOf(CURRENT.cmp_stat));
    const expected = { ...drawn(CURRENT.cmp_stat), id: 'cmp_chart', turn: 2 };

    assert.equal(stat?.kind, 'key_number');
    assert.deepEqual(stat, {
        ...expected,
        source: 'OECD CRS',
        info: { ...expected.info!, label: 'OECD CRS' },
    });
});

test('an answer that resolves no component draws nothing', () => {
    const [heldChart] = sharedViewOf(row('canvas', 'live')).saved.widgets;

    assert.equal(
        widgetFromLiveCard(heldChart!, {
            component_id: 'cmp_chart',
            revision: 1,
            payload: {},
            fact_summary: {} as LiveFactSummary,
        }),
        null,
    );
});

// --- The refresh route, as the browser calls it -----------------------------

type Reply = { status?: number; body: unknown } | Error;

const CARD = liveCardOf(CURRENT.cmp_chart);

// A site whose refresh route answers each card from its own script, one
// reply per call, repeating the last. The clock stands at 0.
const site = (script: Record<string, Reply[]>) => {
    const calls: { cardId: string; init: RequestInit | undefined }[] = [];
    const deps: LiveDeps = {
        fetch: async (input, init) => {
            const cardId = decodeURIComponent(
                /cards\/([^/]+)\/refresh(\?|$)/.exec(String(input))![1]!,
            );
            const replies = script[cardId]!;
            const reply = replies.length > 1 ? replies.shift()! : replies[0]!;

            calls.push({ cardId, init });

            if (reply instanceof Error) {
                throw reply;
            }

            return Response.json(reply.body, { status: reply.status ?? 200 });
        },
    };

    return { deps, calls };
};

const settle = async (
    deps: LiveDeps,
    cardIds: string[],
    signal = new AbortController().signal,
    slots: Record<string, number> = {},
) => {
    const outcomes: Record<string, LiveCardOutcome> = {};
    const order: string[] = [];

    await refreshLiveCards(deps, {
        shareId: 'Ab12Cd34',
        cardIds,
        slots,
        signal,
        onSettled: (cardId, outcome) => {
            outcomes[cardId] = outcome;
            order.push(cardId);
        },
    });

    return { outcomes, order };
};

test('each card settles on its own answer, and one failing card leaves the rest standing', async () => {
    const { deps, calls } = site({
        current: [{ body: { status: 'current', card: CARD } }],
        redrawn: [{ body: { status: 'redrawn', card: CARD } }],
        refused: [{ body: { status: 'error', code: 'recipe_missing' } }],
        gone: [{ status: 404, body: { code: 'not_found', retryable: false } }],
        unreachable: [{ status: 502, body: { code: 'transient_unavailable', retryable: true } }],
        offline: [new TypeError('fetch failed')],
        garbled: [{ body: { status: 'current' } }],
        broken: [{ status: 500, body: null }],
        pending: [{ body: { status: 'pending', retry_after_s: 6 } }],
    });
    const { outcomes } = await settle(deps, [
        'current',
        'redrawn',
        'refused',
        'gone',
        'unreachable',
        'offline',
        'garbled',
        'broken',
        'pending',
    ]);

    assert.deepEqual(outcomes, {
        current: { status: 'ready', outcome: 'current', card: CARD },
        redrawn: { status: 'ready', outcome: 'redrawn', card: CARD },
        refused: { status: 'error', code: 'recipe_missing' },
        gone: { status: 'error', code: 'not_found' },
        unreachable: { status: 'error', code: 'transient_unavailable', retryable: true },
        offline: { status: 'error', code: 'network_error' },
        garbled: { status: 'error', code: 'refresh_invalid' },
        broken: { status: 'error', code: 'refresh_failed' },
        // The route gives no pending answer, so one is outside its contract.
        pending: { status: 'error', code: 'refresh_invalid' },
    });
    // ... and is asked once, not again after its retry_after_s.
    assert.equal(calls.filter(({ cardId }) => cardId === 'pending').length, 1);
});

test("a request is a bare GET to the share-gated route for the card's slot, left to the browser's cache", async () => {
    const { deps, calls } = site({
        'cmp a/b': [{ body: { status: 'current', card: CARD } }],
        unslotted: [{ status: 404, body: { code: 'not_found' } }],
    });
    const seen: string[] = [];
    const fetcher = deps.fetch;

    deps.fetch = async (input, init) => {
        seen.push(String(input));

        return fetcher(input, init);
    };

    await settle(deps, ['cmp a/b', 'unslotted'], undefined, { 'cmp a/b': 3 });

    // A card with no slot asks with none, which the route answers 404.
    assert.deepEqual(seen, [
        '/api/share/Ab12Cd34/cards/cmp%20a%2Fb/refresh?slot=3',
        '/api/share/Ab12Cd34/cards/unslotted/refresh',
    ]);
    // A GET under the default cache mode, so the browser revalidates the
    // card with the route's ETag.
    assert.equal(calls[0]!.init?.method ?? 'GET', 'GET');
    assert.equal(calls[0]!.init?.cache, undefined);
    assert.equal(calls[0]!.init?.body, undefined);
    assert.equal(calls[0]!.init?.headers, undefined);
});

test('requests run a few at a time, and a card is reported as soon as it answers', async () => {
    const cardIds = Array.from({ length: 11 }, (_, index) => `card_${index}`);
    const release = new Map<string, () => void>();
    let inFlight = 0;
    let peak = 0;
    const deps: LiveDeps = {
        fetch: async (input) => {
            const cardId = /cards\/([^/]+)\/refresh$/.exec(String(input))![1]!;

            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await new Promise<void>((resolve) => release.set(cardId, resolve));
            inFlight -= 1;

            return Response.json({ status: 'current', card: CARD });
        },
    };
    const order: string[] = [];
    const done = refreshLiveCards(deps, {
        shareId: 'Ab12Cd34',
        cardIds,
        signal: new AbortController().signal,
        onSettled: (cardId) => order.push(cardId),
    });
    const tick = () => new Promise((resolve) => setImmediate(resolve));

    await tick();
    assert.deepEqual([...release.keys()], cardIds.slice(0, LIVE_REFRESH_CONCURRENCY));

    // The third card answers first: it is reported while the first two are
    // still in flight, and the next card takes its place.
    release.get('card_2')!();
    await tick();
    assert.deepEqual(order, ['card_2']);
    assert.ok(release.has(`card_${LIVE_REFRESH_CONCURRENCY}`));

    while (order.length < cardIds.length) {
        for (const [cardId, open] of release) {
            release.delete(cardId);
            open();
        }

        await tick();
    }

    await done;
    assert.equal(peak, LIVE_REFRESH_CONCURRENCY);
});

test('nothing is reported after the canvas goes away', async () => {
    const controller = new AbortController();
    const { deps } = site({
        leaving: [{ body: { status: 'current', card: CARD } }],
        answered: [{ body: { status: 'current', card: CARD } }],
    });
    const fetcher = deps.fetch;

    deps.fetch = async (input, init) => {
        controller.abort();

        return fetcher(input, init);
    };

    const { order } = await settle(deps, ['leaving', 'answered'], controller.signal);

    assert.deepEqual(order, []);
});

test('a refreshed card names what its data leaves out, from its coverage_gap warnings alone', () => {
    const [heldChart] = sharedViewOf(row('canvas', 'live')).saved.widgets;
    const answer = liveCardOf(CURRENT['cmp_chart']!);
    const withWarnings = (warnings: unknown[]): LiveCard => ({
        ...answer,
        payload: { ...answer.payload, provenance: { ...answer.payload['provenance']!, warnings } },
    });
    const infoOf = (card: LiveCard) => {
        const widget = widgetFromLiveCard(heldChart!, card);

        assert.ok(widget && widget.kind !== 'text' && widget.info);

        return widget.info;
    };

    assert.deepEqual(
        infoOf(
            withWarnings([
                { kind: 'coverage_gap', detail: '3 series have no 2024 value: Chad, Mali, Niger' },
                { kind: 'provisional', detail: 'No live revision endpoint' },
                { kind: 'coverage_gap', detail: 'Rows for Kosovo were left out' },
            ]),
        ).leftOut,
        ['3 series have no 2024 value: Chad, Mali, Niger', 'Rows for Kosovo were left out'],
    );
    // No gap, no field: the card and its panel show nothing extra.
    assert.ok(!('leftOut' in infoOf(withWarnings([{ kind: 'provisional', detail: 'Estimate' }]))));
    assert.ok(!('leftOut' in infoOf(answer)));
});

test('an error answer carries what the back end said about retrying', async () => {
    const { deps } = site({
        stored: [{ body: { status: 'error', code: 'release_mismatch', retryable: true } }],
        plain: [{ body: { status: 'error', code: 'recipe_missing' } }],
    });
    const { outcomes } = await settle(deps, ['stored', 'plain']);

    assert.deepEqual(outcomes, {
        stored: { status: 'error', code: 'release_mismatch', retryable: true },
        plain: { status: 'error', code: 'recipe_missing' },
    });
});

test('a card names what its data left out wherever it is shown', () => {
    const gap = '2 series have no 2025 value: Tanzania, Uganda';
    const withGap = {
        ...saved,
        widgets: saved.widgets.map((widget) =>
            widget.kind !== 'text' && widget.id === 'cmp_chart'
                ? { ...widget, info: { ...widget.info!, leftOut: [gap] } }
                : widget,
        ),
    };
    const leftOutBy = (view: ReturnType<typeof sharedViewOf>) =>
        Object.fromEntries(
            view.saved.widgets
                .filter((widget) => widget.kind !== 'text')
                .map((widget) => [widget.id, leftOutOf(widget.info)]),
        );
    const view = (mode: string | null) => sharedViewOf({ ...row('canvas', mode), data: withGap });

    // A snapshot, and the owner's own canvas, show the stored line; a card
    // with no gap shows nothing.
    assert.deepEqual(leftOutBy(view('snapshot')), {
        cmp_chart: [gap],
        cmp_stat: [],
        cmp_table: [],
    });
    assert.deepEqual(leftOutOf(undefined), []);
    // A live share holds its cards back, so each is drawn with the line of
    // its current answer instead.
    assert.deepEqual(leftOutBy(view('live')), { cmp_chart: [], cmp_stat: [], cmp_table: [] });
});

test('a failed card offers a retry only for a fault the same request can outlive', () => {
    const transient = [
        'backend_unreachable',
        'backend_timeout',
        'backend_refused',
        'backend_invalid',
        'refresh_failed',
        'upstream_unavailable',
        LIVE_CLIENT_CODES.network,
        LIVE_CLIENT_CODES.invalid,
    ];
    const permanent = [
        'not_found',
        'frame_unsupported',
        'frame_not_refreshable',
        'render_target_mismatch',
        'recipe_not_found',
        // dfo-apis says it is not retryable (a permanent store failure).
        'internal_error',
        LIVE_CLIENT_CODES.unreadable,
        'a_code_no_list_names',
    ];

    assert.deepEqual(
        transient.map((code) => liveCardFailure({ code }).retry),
        transient.map(() => true),
    );
    assert.deepEqual(
        permanent.map((code) => liveCardFailure({ code }).retry),
        permanent.map(() => false),
    );
    // Two messages in all, one per group.
    assert.equal(
        new Set([...transient, ...permanent].map((c) => liveCardFailure({ code: c }).message)).size,
        2,
    );
});

test('a refusal its back end calls retryable is transient whatever its code', () => {
    // dfo-apis' problem body carries `retryable`: true for its retry_after_delay
    // and refresh_then_retry modes.
    const retryableCodes = [
        'release_mismatch',
        'frame_unavailable',
        'edit_conflict',
        'service_unavailable',
        'timeout',
        'a_code_no_list_names',
    ];

    for (const code of retryableCodes) {
        assert.equal(liveFailureKind({ code, retryable: true }), 'transient', code);
        assert.equal(liveFailureKind({ code, retryable: false }), 'permanent', code);
        assert.equal(liveCardFailure({ code, retryable: true }).retry, true, code);
    }
});

test('the live note dates the text by the UTC day the share was made', () => {
    assert.match(liveNote('2026-10-07T23:59:30.000Z'), /written 7 Oct 2026$/);
    assert.match(liveNote('2026-10-08T00:00:30.000Z'), /written 8 Oct 2026$/);
    // September stays "Sep", whatever the ICU version prints for en-GB.
    assert.match(liveNote('2026-09-28T12:00:00.000Z'), /written 28 Sep 2026$/);
    // The gallery passes a canvas with no creation time.
    assert.doesNotMatch(liveNote(undefined), /written/);
    assert.doesNotMatch(liveNote('not a date'), /written|Invalid/);
});

test('a card of a live canvas retries itself, and a card off it has no live state', () => {
    const retried: string[] = [];
    const canvas = {
        shareId: 'shr_1',
        snapshot: false,
        createdAt: '2026-10-07T00:00:00.000Z',
        states: { cmp_chart: { status: 'error', code: 'backend_timeout' } as const },
        retry: (cardId: string) => retried.push(cardId),
    };

    cardLiveOf(canvas, 'cmp_chart')?.retry();

    assert.deepEqual(retried, ['cmp_chart']);
    assert.equal(cardLiveOf(canvas, 'txt_1'), undefined);
    assert.equal(cardLiveOf(undefined, 'cmp_chart'), undefined);
});

test('the browser fills every data card of a live share, and only the undrawn cards of a snapshot', () => {
    const widgets = [
        {
            kind: 'chart',
            id: 'c1',
            turn: 1,
            chartType: 'line',
            title: '',
            categories: [],
            series: [],
        },
        { kind: 'table', id: 't1', turn: 1, title: '', columns: [], rows: [] },
        { kind: 'text', id: 'n1', title: 'Mine', body: 'Words' },
    ] as Widget[];

    assert.deepEqual(cardsToFill({ id: 'Ab3dEf7h', live: true }, widgets), {
        shareId: 'Ab3dEf7h',
        snapshot: false,
        cardIds: ['c1', 't1'],
    });
    assert.deepEqual(cardsToFill({ id: 'Ab3dEf7h', live: false, undrawn: ['t1'] }, widgets), {
        shareId: 'Ab3dEf7h',
        snapshot: true,
        cardIds: ['t1'],
    });
    // A snapshot whose page drew every card, a gallery snapshot, and no share.
    assert.equal(cardsToFill({ id: 'Ab3dEf7h', live: false, undrawn: [] }, widgets), null);
    assert.equal(cardsToFill({ id: 'gallery-slug' }, widgets), null);
    assert.equal(cardsToFill(undefined, widgets), null);

    // A snapshot's filled cards carry no live note.
    const states = { t1: { status: 'loading' } as const };
    const retry = () => {};

    assert.equal(
        isLiveCanvas({ shareId: 'Ab3dEf7h', snapshot: true, createdAt: undefined, states, retry }),
        false,
    );
    assert.equal(
        isLiveCanvas({ shareId: 'Ab3dEf7h', snapshot: false, createdAt: undefined, states, retry }),
        true,
    );
});
