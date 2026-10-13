/**
 * A card's stored description through the More Info panel's view: the
 * reader, the block adapters, and the choice between a described and a
 * legacy panel. `fixtures/descriptions/` holds every accepting description
 * vector of dfo-spec-kit's `dfo_descriptions/vectors` and the kit's
 * described `line_chart` envelope
 * (`dfo_spec_kit_components/catalogue/fixtures/line_chart/payload_description.json`),
 * copied verbatim from dfo-spec-kit 894c2ff.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import type { CardInfo, ChartWidget, Widget } from '../../chat/widgets.ts';
import { readDescription, type Description } from '../description.ts';
import {
    describedPanel as describedPanelOn,
    type DescribedView,
    type LegacyView,
    localDay,
    type PanelOptions,
    type PanelView,
} from '../descriptionBlocks.ts';
import {
    cardDescription,
    logRefusedDescriptions,
    panelViewOf as panelViewOn,
} from '../infoPanel.ts';
import { leftOutOf, widgetFromLiveCard } from '../liveCards.ts';
import { describedBy, payloadDescription } from '../payload.ts';
import { reviseWidget, widgetFromComponent } from '../widgets.ts';
import type { ComponentCreated, ComponentRevised, FactSummary } from '../wire.ts';

const FIXTURES = new URL('./fixtures/descriptions/', import.meta.url);

const readFixture = (name: string): Record<string, unknown> =>
    JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));

// The day the reader reads the card, which the full citation names.
const TODAY = '2026-10-12';

const describedPanel = (description: Description, options: Partial<PanelOptions> = {}) =>
    describedPanelOn(description, { retrievedOn: TODAY, ...options });
const panelViewOf = (info: CardInfo) => panelViewOn(info, { retrievedOn: TODAY });

const VECTORS = readdirSync(FIXTURES).filter((name) => name.startsWith('description-'));

// The card vectors' one caveat, as the composer words it.
const CAVEAT_TEXT = 'Values of infectious disease control in 2024 are provisional.';
// The card vectors' line for their 2 of 3 series that reach the latest period.
const REACH_TEXT = '2 of 3 series reach 2024.';

// Fixed values of a CRS card, as the graph describes them: a provider, which
// has no definition, and a type of flow, which has one.
const PROVIDER_FIXED = {
    property: { ref: 'financingProvider', label: 'provider' },
    value: { ref: 'country/DEU', label: 'Germany' },
};
const FLOW_FIXED = {
    property: { ref: 'crsTypeOfFlow', label: 'flow' },
    value: {
        ref: 'CRSTypeOfFlow10',
        label: 'official development assistance',
        definition:
            'Concessional financing from official providers with development as its primary objective, reported to the OECD DAC under the CRS framework.',
    },
};

const vectorInput = (name: string): Record<string, unknown> =>
    readFixture(name)['input'] as Record<string, unknown>;

const ENVELOPE = readFixture('envelope-line-chart-described.json');

// A description read from an untyped value, or undefined when it is refused.
const asDescription = (value: unknown): Description | undefined => {
    const read = readDescription(value);

    return 'description' in read ? read.description : undefined;
};

const described = (input: Record<string, unknown>): Description => {
    const description = asDescription(input);

    assert.ok(description, 'the description reads');

    return description;
};

// A legacy view, or a failed test.
const legacy = (view: PanelView): LegacyView => {
    assert.equal(view.kind, 'legacy');

    return view as LegacyView;
};

const rowsOf = (view: PanelView, key: string): Record<string, string> =>
    Object.fromEntries(
        (legacy(view).blocks.find((block) => block.key === key)?.rows ?? []).map((row) => [
            row.label,
            row.value,
        ]),
    );

// Every text a described view shows a reader.
const shownTexts = (view: DescribedView): string[] =>
    [
        view.title,
        view.live,
        view.measure?.label,
        view.measure?.definition,
        ...view.rows.flatMap((row) => [row.label, row.value]),
        ...view.terms.flatMap((list) => [
            list.label,
            ...list.terms.flatMap((term) => [term.name, term.definition]),
        ]),
        ...view.keepInMind,
        view.from,
        ...view.sources.flatMap((source) => [source.name, source.meta]),
        view.cite.short,
        view.cite.full,
        view.cite.hint,
        ...(view.made?.steps ?? []),
        ...(view.made?.notes ?? []),
        ...(view.made?.pages.map((page) => page.name) ?? []),
    ].filter((text) => typeof text === 'string');

const facts: FactSummary = {
    component_id: 'cmp_Ab3dE5gH7k',
    revision: 2,
    series: [{ id: 'nga_health_policy', label: 'Health policy', point_count: 15 }],
    attribution: { label: 'OECD CRS · 3 indicator(s)', source_count: 1, indicator_count: 3 },
    window: { start: '2010', end: '2024' },
};

const createdFrame = (payload: Record<string, unknown>): ComponentCreated => ({
    event: 'component.created',
    seq: 1,
    component_id: 'cmp_Ab3dE5gH7k',
    revision: 2,
    type: 'line_chart',
    catalog_version: '2026.10.0',
    min_catalog_version: '2026.10.0',
    payload,
    fact_summary: facts,
    provenance: {
        inputs: [
            {
                spec_id: 'spec_91d7345eec81a029629938b3d0ffd775',
                content_version: 'cv_b785befb9f87471de96eb31cd7c56f5c',
            },
        ],
        sources: [],
        freshness: { data_through: '', last_refreshed: '', partial_period: false },
        warnings: [],
        generated_at: '2026-09-28T09:14:00Z',
        citation: '',
    },
});

// Runs `body` with a `fetch` that fails the test when anything calls it.
const withoutFetch = (body: () => void): void => {
    const original = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = (() => {
        calls += 1;

        throw new Error('the described panel made a request');
    }) as typeof fetch;

    try {
        body();
    } finally {
        globalThis.fetch = original;
    }

    assert.equal(calls, 0);
};

// What `body` logs as refused, by component, revision and reason.
const refusalsIn = (body: () => void): unknown[] => {
    const logged: unknown[] = [];
    const original = console.warn;

    console.warn = (...args: unknown[]) => {
        logged.push(args[1]);
    };

    try {
        body();
    } finally {
        console.warn = original;
    }

    return logged;
};

// The envelope's description without its `cite`, which the reader refuses.
const withoutCite = (): Record<string, unknown> => {
    const description = { ...(ENVELOPE['description'] as Record<string, unknown>) };

    delete description['cite'];

    return description;
};

const revisedFrame = (revision: number, payload: Record<string, unknown>): ComponentRevised => ({
    event: 'component.revised',
    seq: revision,
    component_id: 'cmp_Ab3dE5gH7k',
    revision,
    changed: ['payload'],
    fact_summary: { ...facts, revision },
    payload: { ...payload, revision },
});

// A live share's held card, which keeps nothing it showed.
const heldChart = (): ChartWidget => ({
    kind: 'chart',
    id: 'cmp_Ab3dE5gH7k',
    chartType: 'line',
    title: '',
    categories: [],
    series: [],
});

const liveCard = (revision: number, payload: Record<string, unknown>) => ({
    component_id: 'cmp_Ab3dE5gH7k',
    revision,
    payload: { ...payload, revision },
    fact_summary: {
        series: [],
        series_cut: 0,
        window: { start: '2010', end: '2024' },
        unit: null,
    },
});

test('every accepting kit description vector reads and builds a panel view', () => {
    assert.ok(VECTORS.length >= 8, `found ${VECTORS.length} vectors`);

    for (const name of VECTORS) {
        const input = vectorInput(name);
        const description = described(input);
        const view = describedPanel(description, { canShare: true });
        const shown = shownTexts(view);

        assert.equal(view.title, input['title'], name);
        assert.equal(description.sources.length, (input['sources'] as unknown[]).length, name);
        assert.equal(
            description.caveats.length,
            (input['caveats'] as unknown[]).length,
            `${name}: the reader keeps every caveat`,
        );
        assert.ok(
            description.caveats.every((caveat) => view.keepInMind.includes(caveat.text)),
            `${name}: Keep in mind shows every caveat`,
        );
        assert.ok(
            view.sources.every((source) => source.lookup === null),
            `${name}: no source is looked up`,
        );
        // No identifier, and nothing shown reads 0, None or Unknown.
        assert.doesNotMatch(shown.join('\n'), /\b(spec|cv|ops|ocv|cmp|voc)_[0-9a-zA-Z]/, name);
        assert.deepEqual(
            shown.filter((text) => ['0', 'None', 'Unknown'].includes(text)),
            [],
            name,
        );
        // A saved card's description reads back as it was stored.
        assert.deepEqual(
            cardDescription({ description: JSON.parse(JSON.stringify(description)) }),
            description,
            name,
        );
    }
});

test('the card vector shows what it draws, what it is within, its source, citation and steps', () => {
    const view = describedPanel(described(vectorInput('description-card-revision.json')));
    const termsOf = ({ terms }: DescribedView) =>
        terms.map(({ label, terms: listed }) => [
            label,
            listed.map(({ name, definition }) => [name, definition]),
        ]);
    const definitionOf = (label: string): string => {
        const value = (
            (vectorInput('description-card-revision.json')['about'] as Description['about']).drawn
                ?.dimensions?.[0]?.values ?? []
        ).find((entry) => entry.label === label);

        assert.ok(value?.definition);

        return value.definition;
    };

    assert.deepEqual(
        { ...view, sources: undefined, terms: undefined },
        {
            kind: 'described',
            title: 'Gross disbursements to Nigeria for health, 2010 to 2024',
            live: null,
            // The measure has no definition, so it has no line.
            measure: null,
            rows: [
                { label: 'Years', value: '2010–2024' },
                { label: 'Unit', value: 'US dollars, current prices' },
            ],
            keepInMind: [CAVEAT_TEXT, REACH_TEXT],
            from: null,
            cite: {
                short: 'OECD Creditor Reporting System (CRS) (2026), via the Development Finance Observatory',
                full: 'OECD Creditor Reporting System (CRS) (2026), via the Development Finance Observatory. "Gross disbursements to Nigeria for health" [dataset]. Retrieved 12 October 2026.',
                // Only the card's owner is told how to get a link.
                hint: null,
            },
            made: {
                steps: [
                    'Drew 3 series of gross disbursements to Nigeria for health, 2010 to 2024.',
                ],
                notes: ['The source does not say how many values are estimated or provisional.'],
                pages: [
                    {
                        key: 'provenance/OECDCreditorReportingSystem#0',
                        name: 'How OECD Creditor Reporting System (CRS) data is processed',
                        page: 'provenance/OECDCreditorReportingSystem',
                    },
                ],
            },
            sources: undefined,
            terms: undefined,
        },
    );
    // The vector fixes only the recipient, which has no definition, so there is no "Within".
    assert.deepEqual(termsOf(view), [
        [
            'Shows',
            [
                ['basic health care', definitionOf('basic health care')],
                [
                    'health policy and administrative management',
                    definitionOf('health policy and administrative management'),
                ],
                ['infectious disease control', definitionOf('infectious disease control')],
            ],
        ],
    ]);
    // "Within" names only the fixed values a definition explains, so not the recipient or provider.
    const about = vectorInput('description-card-revision.json')['about'] as Description['about'];
    const within = describedPanel(
        described({
            ...vectorInput('description-card-revision.json'),
            about: { ...about, fixed: [...(about.fixed ?? []), PROVIDER_FIXED, FLOW_FIXED] },
        }),
    );

    assert.deepEqual(termsOf(within).at(-1), [
        'Within',
        [[FLOW_FIXED.value.label, FLOW_FIXED.value.definition]],
    ]);
    assert.deepEqual(view.sources, [
        {
            key: 'provenance/OECDCreditorReportingSystem#0',
            name: 'OECD Creditor Reporting System (CRS)',
            url: null,
            page: 'provenance/OECDCreditorReportingSystem',
            meta: 'OECD · OECD Terms and Conditions',
            lookup: null,
        },
    ]);
});

test('a drawn dimension without its values reads its count, and several dimensions read by name', () => {
    const input = vectorInput('description-card-revision.json');
    const about = input['about'] as {
        fixed: Record<string, unknown>[];
        drawn: { dimensions: Record<string, unknown>[] };
    };
    const [sector] = about.drawn.dimensions;
    const provider = {
        property: { ref: 'financingProvider', label: 'provider' },
        count: 2,
        of: 63,
        values: [
            { ref: 'country/USA', label: 'United States', definition: 'A donor.' },
            { ref: 'GlobalFund', label: 'Global Fund' },
        ],
    };
    const country = { property: { ref: 'country', label: 'country' }, count: 60, of: 60 };
    const viewOf = (dimensions: unknown[]) =>
        describedPanel(
            described({
                ...input,
                about: {
                    ...about,
                    fixed: [...about.fixed, FLOW_FIXED],
                    drawn: { ...about.drawn, dimensions },
                },
            }),
        );
    const labels = (view: DescribedView) => [
        view.rows.map((row) => `${row.label}: ${row.value}`),
        view.terms.map(
            (list) => `${list.label}: ${list.terms.map((term) => term.name).join(', ')}`,
        ),
    ];

    // A card with no values listed.
    assert.deepEqual(
        labels(describedPanel(described(vectorInput('description-card-without-measure.json')))),
        [['Sectors: 3', 'Years: 2010–2024', 'Unit: US dollars, current prices'], []],
    );
    // More than 50 values leave the list out, and a count of 0 reads nothing.
    assert.deepEqual(labels(viewOf([{ ...sector }, country, { ...country, count: 0 }]))[0], [
        'Countries: 60',
        'Years: 2010–2024',
        'Unit: US dollars, current prices',
    ]);
    assert.deepEqual(labels(viewOf([sector, provider]))[1], [
        'Sectors: basic health care, health policy and administrative management, infectious disease control',
        'Providers: United States, Global Fund',
        `Within: ${FLOW_FIXED.value.label}`,
    ]);

    // A list that disagrees with its count shows only the count row, and no
    // value is listed.
    const values = sector['values'] as { ref: string }[];

    assert.equal(sector['count'], 3);
    for (const [why, listed] of [
        ['short', values.slice(0, 2)],
        ['empty', []],
        ['duplicate refs', [values[0], values[1], values[0]]],
    ] as const) {
        assert.deepEqual(
            labels(viewOf([{ ...sector, values: listed }])),
            [
                ['Sectors: 3', 'Years: 2010–2024', 'Unit: US dollars, current prices'],
                [`Within: ${FLOW_FIXED.value.label}`],
            ],
            why,
        );
    }
});

test('a source with no document has no page link', () => {
    const input = vectorInput('description-card-revision.json');
    const [source] = input['sources'] as Record<string, unknown>[];
    const undocumented = { ...source };

    delete undocumented['documentation'];
    const view = describedPanel(described({ ...input, sources: [undocumented] }));

    assert.equal(view.sources[0]?.page, null);
    assert.equal(view.made?.pages.length, 0);
});

test('a live rendering says so under its title and defines its measure', () => {
    const description = described(vectorInput('description-card-live-rendering.json'));
    const view = describedPanel(description);

    assert.equal(description.rendering, 'live');
    assert.deepEqual(description.frame, {
        id: 'spec_91d7345eec81a029629938b3d0ffd775',
        content_version: 'cv_b785befb9f87471de96eb31cd7c56f5c',
    });
    assert.equal(view.live, 'Drawn live from the latest data');
    assert.deepEqual(view.measure, {
        label: 'Gross disbursements',
        definition:
            'Funds released to a recipient, or spent on goods and services for it, counted in full before any repayments are deducted.',
    });
});

test("the card's owner is told how to get a link to cite, and no one else is", () => {
    const hintOf = (name: string, canShare: boolean) =>
        describedPanel(described(vectorInput(name)), { canShare }).cite.hint;

    assert.deepEqual(
        [
            hintOf('description-card-revision.json', true),
            hintOf('description-card-live-rendering.json', true),
            hintOf('description-card-revision.json', false),
            hintOf('description-card-live-rendering.json', false),
        ],
        [
            'Add a link to cite: Share › Snapshot.',
            'A live link can show new numbers later. Cite a snapshot: Share › Snapshot.',
            null,
            null,
        ],
    );
});

test('the reference-list form is retrieved today and names a snapshot and its capture date', () => {
    const description = described(vectorInput('description-card-revision.json'));
    const fullOf = (options: Partial<PanelOptions>) =>
        describedPanel(description, options).cite.full;
    const cited =
        'OECD Creditor Reporting System (CRS) (2026), via the Development Finance Observatory. "Gross disbursements to Nigeria for health" [dataset].';
    const link = 'https://dfo.one.org/s/abc123';

    assert.deepEqual(
        [
            fullOf({}),
            fullOf({ snapshotUrl: link, snapshotAsOf: '2026-09-28' }),
            fullOf({ snapshotUrl: link, snapshotAsOf: null }),
        ],
        [
            // The description's own date is when the version was prepared,
            // so it is never the retrieval date.
            `${cited} Retrieved 12 October 2026.`,
            `${cited} Retrieved 12 October 2026 from ${link} (snapshot, data as of 28 Sep 2026).`,
            `${cited} Retrieved 12 October 2026 from ${link} (snapshot).`,
        ],
    );
});

test('a moment is read as the calendar day it falls on where the reader is', () => {
    assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('a rendering without its frame, or a frame without its rendering, is refused', () => {
    const live = vectorInput('description-card-live-rendering.json');
    const withoutFrame = { ...live };
    const withoutRendering = { ...live };

    delete withoutFrame['frame'];
    delete withoutRendering['rendering'];

    assert.deepEqual(readDescription(withoutFrame), { refused: 'rendering without frame' });
    assert.deepEqual(readDescription(withoutRendering), { refused: 'frame without rendering' });
    assert.deepEqual(readDescription({ ...live, frame: { id: 'spec_x' } }), {
        refused: 'rendering or frame unreadable',
    });
});

test('a computed card names its inputs, its own steps and the data it leaves out', () => {
    const view = describedPanel(described(vectorInput('description-computed-quotient.json')));
    const unknownInput = describedPanel(
        described(vectorInput('description-computed-input-without-id.json')),
    );

    assert.deepEqual(view.rows, [
        { label: 'Years', value: '2010–2024' },
        { label: 'Unit', value: 'Ratio' },
    ]);
    assert.equal(view.measure, null);
    assert.deepEqual(view.terms, []);
    assert.equal(view.from, 'Computed by the Development Finance Observatory from');
    assert.deepEqual(
        view.sources.map(({ name, page, meta }) => [name, page, meta]),
        [
            ['Gross ODA disbursements', null, null],
            ['Gross national income', null, null],
        ],
    );
    assert.equal(view.made?.steps.length, 3);
    assert.deepEqual(view.made?.notes, []);
    // Its one caveat, then the series short of the latest period.
    assert.deepEqual(view.keepInMind.slice(1), ['32 of 38 series reach 2024.']);
    assert.match(view.cite.short, /processed by the Development Finance Observatory$/);
    // An input whose id is unknown stays by its label.
    assert.deepEqual(
        unknownInput.sources.map(({ name }) => name),
        ['Gross ODA disbursements', 'Gross national income'],
    );
    // A card drawn from a computed version is computed too, and one drawn from a
    // dataset version is not.
    const card = vectorInput('description-card-revision.json');
    const fromOf = (id: string) =>
        describedPanel(described({ ...card, cite: { ...(card['cite'] as object), id } })).from;

    assert.deepEqual(
        [fromOf('ops_3c9e1f7a2b8d4e6f'), fromOf('spec_91d7345eec81a029629938b3d0ffd775')],
        ['Computed by the Development Finance Observatory from', null],
    );
});

test('an unknown unit has no row and a sentence in Keep in mind; a unit of none has neither', () => {
    const input = vectorInput('description-card-revision.json');
    const about = input['about'] as Record<string, unknown>;
    const view = (gaps: string[]) =>
        describedPanel(described({ ...input, about: { ...about, unit: null }, gaps }));

    assert.deepEqual(
        [view(['about.unit']), view([])].map(({ rows, keepInMind }) => [
            rows.map((row) => row.label),
            keepInMind,
        ]),
        [
            [['Years'], [CAVEAT_TEXT, REACH_TEXT, 'The unit is not known.']],
            [['Years'], [CAVEAT_TEXT, REACH_TEXT]],
        ],
    );
});

test('how a card was made says which steps and counts are unknown', () => {
    const input = vectorInput('description-card-revision.json');
    const notesOf = (gaps: string[], steps: unknown = input['steps']) =>
        describedPanel(described({ ...input, steps, gaps })).made?.notes;
    const cases: [string[], unknown, string[]][] = [
        [
            ['freshness.estimated_values', 'freshness.provisional_values'],
            input['steps'],
            ['The source does not say how many values are estimated or provisional.'],
        ],
        [
            ['freshness.estimated_values'],
            input['steps'],
            ['The source does not say how many values are estimated.'],
        ],
        [
            ['freshness.provisional_values'],
            input['steps'],
            ['The source does not say how many values are provisional.'],
        ],
        [[], input['steps'], []],
        [['steps'], null, ['The steps behind these figures are not known.']],
        [['steps.source_pipeline'], [], ['The steps behind these figures are not known.']],
    ];

    assert.deepEqual(
        cases.map(([gaps, steps]) => notesOf(gaps, steps)),
        cases.map(([, , notes]) => notes),
    );
    assert.deepEqual(
        describedPanel(described(vectorInput('description-steps-null.json'))).made?.notes,
        ['The steps behind these figures are not known.'],
    );
});

test('keep in mind counts estimated and provisional values no caveat tells, and series short of the latest period', () => {
    const input = vectorInput('description-card-revision.json');
    // The vector's three series all reach 2024, so only the counts speak.
    const freshness = { ...(input['freshness'] as Record<string, unknown>), series_reaching_it: 3 };
    const estimatedCaveat = {
        kind: 'estimated',
        periods: ['2024'],
        text: 'Values in 2024 are estimates.',
    };
    const provisionalCaveat = {
        kind: 'provisional',
        periods: ['2024'],
        text: 'Values in 2024 are provisional.',
    };
    const cases: [Record<string, unknown>, unknown[], string[], string[]][] = [
        [{ estimated_values: 2 }, [], [], ['2 values are estimates.']],
        [{ estimated_values: 1 }, [], [], ['1 value is an estimate.']],
        [{ estimated_values: 0 }, [], [], []],
        [{ estimated_values: null }, [], [], []],
        [{ estimated_values: 2 }, [estimatedCaveat], [], ['Values in 2024 are estimates.']],
        [{ provisional_values: 4 }, [], [], ['4 values are provisional.']],
        [{ provisional_values: 1 }, [], [], ['1 value is provisional.']],
        [{ provisional_values: 0 }, [], [], []],
        [{ provisional_values: 4 }, [provisionalCaveat], [], ['Values in 2024 are provisional.']],
        // Series short of the latest period, as the vector serves them, 2 of its 3.
        [{ series_reaching_it: 2 }, [], [], ['2 of 3 series reach 2024.']],
        [{ series_reaching_it: 1 }, [], [], ['1 of 3 series reaches 2024.']],
        [{ series_reaching_it: null }, [], ['freshness.series_reaching_it'], []],
        [{ series_reaching_it: 2, latest_period: null }, [], ['freshness.latest_period'], []],
    ];

    assert.deepEqual(
        cases.map(
            ([change, caveats, gaps]) =>
                describedPanel(
                    described({
                        ...input,
                        freshness: { ...freshness, ...change },
                        caveats,
                        gaps,
                    }),
                ).keepInMind,
        ),
        cases.map(([, , , expected]) => expected),
    );
});

test("how a card was made holds the card's own steps and not the source pipeline's", () => {
    const pipeline = describedPanel(
        described(vectorInput('description-served-labels-over-steps-bound.json')),
    );
    const input = vectorInput('description-served-labels-over-steps-bound.json');
    const own = (input['steps'] as { op: string; text: string }[])
        .filter((step) => step.op !== 'source_step')
        .map((step) => step.text);

    assert.ok(own.length > 0);
    assert.deepEqual(pipeline.made?.steps, own);
    assert.deepEqual(
        describedPanel(described(vectorInput('description-source-pipeline-steps.json'))).made
            ?.steps,
        [],
    );
});

test('a composed unit reads its sides, and one unit over itself reads Ratio', () => {
    const quotient = vectorInput('description-computed-quotient.json');
    const about = quotient['about'] as Record<string, unknown>;
    const usd = { ref: 'USDollar', label: 'US dollars' };
    const unitOf = (unit: unknown): string | undefined =>
        describedPanel(described({ ...quotient, about: { ...about, unit } })).rows.find(
            (row) => row.label === 'Unit',
        )?.value;
    const cases: [unknown, string][] = [
        [{ numerator: usd, denominator: usd }, 'Ratio'],
        [
            {
                numerator: { stat_var: 'Count_Person', label: 'population' },
                denominator: { stat_var: 'Count_Person', label: 'people' },
            },
            'Ratio',
        ],
        [
            { numerator: { ...usd, prices: 'constant', base_year: 2021 }, denominator: usd },
            'US dollars, constant 2021 prices per US dollars',
        ],
        [
            { numerator: usd, denominator: { stat_var: 'Count_Person', label: 'population' } },
            'US dollars per population',
        ],
    ];

    assert.deepEqual(
        cases.map(([unit]) => unitOf(unit)),
        cases.map(([, words]) => words),
    );
    assert.equal(
        describedPanel(described(vectorInput('description-unit-variable-side.json'))).rows.find(
            (row) => row.label === 'Unit',
        )?.value,
        'US dollars, current prices per population',
    );
});

test('a caveat without its sentence refuses the description', () => {
    const input = vectorInput('description-card-revision.json');
    const caveats = (input['caveats'] as Record<string, unknown>[]).map((caveat) => {
        const untold = { ...caveat };

        delete untold['text'];

        return untold;
    });

    assert.deepEqual(readDescription({ ...input, caveats }), { refused: 'unreadable caveats' });
});

test('a caveat of a kind the reader does not list shows by its sentence', () => {
    const input = vectorInput('description-card-revision.json');
    const caveat = { kind: 'seasonally_adjusted', text: 'Values are seasonally adjusted.' };
    const description = described({
        ...input,
        caveats: [...(input['caveats'] as unknown[]), caveat],
    });

    assert.deepEqual(describedPanel(description).keepInMind, [
        CAVEAT_TEXT,
        'Values are seasonally adjusted.',
        REACH_TEXT,
    ]);
});

test('a malformed source refuses the description, so no gap path shifts', () => {
    const input = vectorInput('description-card-revision.json');
    const [source] = input['sources'] as Record<string, unknown>[];

    assert.deepEqual(
        readDescription({
            ...input,
            sources: [
                { ...source, label: 7 },
                { ...source, licence: null },
            ],
            gaps: ['sources.1.licence'],
        }),
        { refused: 'unreadable sources' },
    );
});

test('a malformed value list or fixed value is left out, and the description still reads', () => {
    const input = vectorInput('description-card-revision.json');
    const about = input['about'] as {
        fixed: Record<string, unknown>[];
        drawn: { dimensions: Record<string, unknown>[] };
    };
    const [dimension] = about.drawn.dimensions;
    const [recipient] = about.fixed;
    const flowTerm = [FLOW_FIXED.value.label, FLOW_FIXED.value.definition];
    const termsOf = (aboutChange: Record<string, unknown>) =>
        describedPanel(described({ ...input, about: { ...about, ...aboutChange } })).terms.map(
            ({ label, terms }) => [label, terms.map((term) => [term.name, term.definition])],
        );

    // A value without its label drops the list, and the dimension stays drawn.
    assert.deepEqual(
        termsOf({
            drawn: {
                ...about.drawn,
                dimensions: [{ ...dimension, values: [{ ref: 'CRSPurposeCode12220' }] }],
            },
            fixed: [],
        }),
        [],
    );
    // A malformed fixed value drops the fixed list.
    assert.deepEqual(
        termsOf({
            drawn: { ...about.drawn, dimensions: [{ ...dimension, values: undefined }] },
            fixed: [
                recipient,
                FLOW_FIXED,
                { ...PROVIDER_FIXED, value: { ref: PROVIDER_FIXED.value.ref } },
            ],
        }),
        [],
    );
    // An empty definition is no definition, so the value is not listed.
    assert.deepEqual(
        termsOf({
            drawn: { ...about.drawn, dimensions: [{ ...dimension, values: undefined }] },
            fixed: [
                recipient,
                FLOW_FIXED,
                { ...PROVIDER_FIXED, value: { ...PROVIDER_FIXED.value, definition: '' } },
            ],
        }),
        [['Within', [flowTerm]]],
    );
});

test('a source links to the page of the source its document route names', () => {
    const input = vectorInput('description-card-revision.json');
    const [source] = input['sources'] as Record<string, unknown>[];
    const pages = (documentation: string) =>
        describedPanel(
            described({
                ...input,
                sources: [{ ...source, ref: 'dc/base/WorldBank_IDS', documentation }],
            }),
        ).sources[0]?.page;

    assert.equal(
        pages('/api/graph/documentation/dc/d/WorldBank_InternationalDebtStatistics'),
        'dc/d/WorldBank_InternationalDebtStatistics',
    );
    assert.equal(pages('/api/graph/documentation/dc/d/A%20b%26c'), 'dc/d/A b&c');
    assert.equal(pages('/api/graph/other/dc/d/WorldBank_IDS'), null);
    assert.equal(pages('/api/graph/documentation/dc/d/%E0%A4%A'), null);
});

test('a value missing a required block is no description', () => {
    const withoutCite = vectorInput('description-card-revision.json');

    delete withoutCite['cite'];

    assert.equal(asDescription(withoutCite), undefined);
    assert.deepEqual(readDescription(withoutCite), { refused: 'unreadable cite' });
    assert.equal(asDescription(null), undefined);
    assert.equal(payloadDescription({ provenance: {} }), undefined);
});

test('a refused description is logged once per frame and the card falls back', () => {
    const payload = { ...ENVELOPE, description: withoutCite() };
    let widget: ChartWidget | undefined;
    const logged = refusalsIn(() => {
        widget = widgetFromComponent(createdFrame(payload)) as ChartWidget;
    });

    assert.deepEqual(logged, [
        { componentId: 'cmp_Ab3dE5gH7k', revision: 2, reason: 'unreadable cite' },
    ]);
    assert.equal(widget?.info?.description, undefined);
    assert.equal(panelViewOf(widget!.info!).kind, 'legacy');
    assert.deepEqual(
        refusalsIn(() => payloadDescription({ ...ENVELOPE, description: undefined })),
        [],
    );
});

test('payloadDescription reads the kit envelope', () => {
    assert.equal(
        describedBy(payloadDescription(ENVELOPE))?.title,
        'Gross disbursements to Nigeria for health, 2010 to 2024',
    );
});

test('a described created card needs no request for its panel', () => {
    withoutFetch(() => {
        const widget = widgetFromComponent(createdFrame(ENVELOPE)) as ChartWidget;
        const info = widget.info!;
        const view = panelViewOf(info);

        assert.equal(view.kind === 'described' && view.title, cardDescription(info)?.title);
        assert.ok(view.sources.length > 0);
        assert.ok(view.sources.every((source) => source.lookup === null));
        // The card face and Download Data name the description's sources.
        assert.deepEqual(
            info.sources?.map((source) => [source.id, source.name]),
            [['provenance/OECDCreditorReportingSystem', 'OECD Creditor Reporting System (CRS)']],
        );
        // The description's cite date is when the version was prepared, so no
        // source carries it as a retrieval date.
        assert.ok(info.sources?.every((source) => source.retrieved === null));
    });
});

test("a card's source id is its first source with a known ref, or none", () => {
    const input = vectorInput('description-computed-input-without-id.json');
    const [known, unknown] = input['sources'] as Record<string, unknown>[];
    const infoWith = (sources: Record<string, unknown>[]) =>
        (
            widgetFromComponent(
                createdFrame({ ...ENVELOPE, description: { ...input, sources } }),
            ) as ChartWidget
        ).info;
    const unknownFirst = infoWith([unknown!, known!]);

    assert.deepEqual(
        unknownFirst?.sources?.map((source) => [source.id, source.name]),
        [
            [null, 'Gross national income'],
            ['spec_4b1f0c2d9e8a7b6c5d4e3f2a1b0c9d8e', 'Gross ODA disbursements'],
        ],
    );
    assert.equal(unknownFirst?.sourceId, 'spec_4b1f0c2d9e8a7b6c5d4e3f2a1b0c9d8e');
    assert.equal(infoWith([unknown!])?.sourceId, null);
});

test('a revised card keeps its description under lineage-only provenance', () => {
    const held = widgetFromComponent(
        createdFrame({ ...ENVELOPE, description: undefined }),
    ) as ChartWidget;
    const revised = reviseWidget(held, {
        event: 'component.revised',
        seq: 2,
        component_id: 'cmp_Ab3dE5gH7k',
        revision: 2,
        changed: ['title'],
        fact_summary: facts,
        payload: ENVELOPE,
    });

    assert.equal(cardDescription(revised.info!)?.describes.kind, 'card_revision');
    const view = panelViewOf(revised.info!);

    assert.equal(
        view.kind === 'described' && view.title,
        describedBy(payloadDescription(ENVELOPE))?.title,
    );
});

test('a refused revision drops the previous revision description', () => {
    // Revision 2 is described; revision 3's description is refused, and its
    // provenance holds lineage only.
    const refused = { ...ENVELOPE, description: withoutCite() };
    const live = { ...ENVELOPE, description: vectorInput('description-card-live-rendering.json') };
    const held = widgetFromComponent(createdFrame(ENVELOPE)) as ChartWidget;
    const redrawn = {
        revised: () =>
            reviseWidget(reviseWidget(held, revisedFrame(2, ENVELOPE)), revisedFrame(3, refused)),
        live: () =>
            widgetFromLiveCard(
                widgetFromLiveCard(heldChart(), liveCard(2, live))!,
                liveCard(3, refused),
            ),
    };

    for (const [path, draw] of Object.entries(redrawn)) {
        let widget: ReturnType<typeof draw>;
        const logged = refusalsIn(() => {
            widget = draw();
        });
        const view = legacy(panelViewOf(widget!.info!));

        assert.deepEqual(
            logged,
            [{ componentId: 'cmp_Ab3dE5gH7k', revision: 3, reason: 'unreadable cite' }],
            path,
        );
        assert.equal(widget!.info?.description, undefined, path);
        assert.equal(view.citation, null, path);
        assert.deepEqual(view.sources, [], path);
    }
});

test('a live card carries its live description to the panel', () => {
    const live = { ...ENVELOPE, description: vectorInput('description-card-live-rendering.json') };
    const drawn = widgetFromLiveCard(heldChart(), liveCard(2, live));

    assert.equal(cardDescription(drawn!.info!)?.rendering, 'live');
    // Its provenance holds lineage only, so the attribution counts the
    // description's sources.
    assert.equal(drawn?.info?.sourceCount, 1);
    assert.equal(drawn?.info?.label, 'OECD Creditor Reporting System (CRS)');
    const view = panelViewOf(drawn!.info!);

    assert.equal(view.kind === 'described' && view.live, 'Drawn live from the latest data');
});

test('an undescribed card renders the legacy rows', () => {
    const widget = widgetFromComponent(
        createdFrame({ ...ENVELOPE, description: undefined }),
    ) as ChartWidget;
    const view = panelViewOf(widget.info!);

    assert.equal(widget.info?.description, undefined);
    assert.deepEqual(rowsOf(view, 'facts'), { Years: '2010–2024', Indicators: '3' });
});

test('a saved gallery card without a description renders the legacy rows', () => {
    const gallery = JSON.parse(
        readFileSync(
            new URL('../../../content/gallery/ghana-debt-indicators.json', import.meta.url),
            'utf8',
        ),
    ) as { widgets: { info?: CardInfo }[] };
    const infos = gallery.widgets.flatMap((widget) => (widget.info ? [widget.info] : []));

    assert.equal(infos.length, 8);

    const views = infos.map((info) => legacy(panelViewOf(info)));

    assert.ok(views.every((view) => view.blocks[0]?.key === 'facts'));

    const [first] = views;

    assert.equal(
        first?.citation,
        'World Bank International Debt Statistics (IDS) via ONE DFO, retrieved 2026-10-05',
    );
    assert.deepEqual(rowsOf(first!, 'facts'), {
        Years: '1970–2024',
        Indicators: '1',
        'Data through': '2024',
        'Last refreshed': infos[0]!.lastRefreshed!,
    });
    assert.deepEqual(first?.sources, [
        {
            key: 'provenance/WorldBankInternationalDebtStatistics',
            name: 'World Bank International Debt Statistics (IDS)',
            url: 'https://datacatalog.worldbank.org/search/dataset/0038015/international-debt-statistics',
            page: null,
            meta: 'Creative Commons Attribution License · retrieved 2026-10-05',
            lookup: 'provenance/WorldBankInternationalDebtStatistics',
        },
    ]);
    assert.deepEqual(first?.indicators, [
        {
            key: 'dcid:Amount_FinancialPosition_AmountOutstanding_Nominal',
            name: 'Outstanding external debt (current US$)',
            id: 'Amount_FinancialPosition_AmountOutstanding_Nominal',
            description: null,
        },
    ]);
    // The machine-shaped indicator description stays hidden.
    assert.equal(views[2]?.indicators[0]?.description, null);
});

test("the card face reads a described card's coverage gaps and a legacy card's left out", () => {
    const provisional = described(vectorInput('description-card-revision.json'));
    const quotient = vectorInput('description-computed-quotient.json');
    const [coverageGap] = quotient['caveats'] as { text: string }[];
    const stepped = { kind: 'break_in_series', text: 'Step s2 left out 2019.', step: 's2' };

    // A provisional value, or a break a step names, stays in More Info.
    assert.deepEqual(leftOutOf({ description: provisional, leftOut: ['ignored'] }), []);
    assert.deepEqual(
        leftOutOf({
            description: described({
                ...quotient,
                caveats: [...(quotient['caveats'] as unknown[]), stepped],
            }),
        }),
        [coverageGap!.text],
    );
    assert.deepEqual(leftOutOf({ leftOut: ['No 2024 value for Ghana.'] }), [
        'No 2024 value for Ghana.',
    ]);
    assert.deepEqual(leftOutOf(null), []);
});

test('a saved card whose description the reader refuses shows the legacy panel', () => {
    // A saved widget is stored verbatim, so its description can be any JSON.
    const malformed = { ...vectorInput('description-card-revision.json'), caveats: 'none' };
    const info: CardInfo = {
        label: 'OECD CRS · 3 indicator(s)',
        sourceId: null,
        sourceName: null,
        sourceCount: 1,
        indicatorCount: 3,
        years: { start: '2010', end: '2024' },
        unit: null,
        licence: null,
        dataThrough: null,
        lastRefreshed: null,
        leftOut: ['No 2024 value for Ghana.'],
        description: malformed,
    };

    assert.equal(cardDescription(info), undefined);
    assert.deepEqual(leftOutOf(info), ['No 2024 value for Ghana.']);
    assert.deepEqual(rowsOf(panelViewOf(info), 'facts'), { Years: '2010–2024', Indicators: '3' });
});

test('loading saved cards logs each refused description once per revision', () => {
    const accepted = vectorInput('description-card-revision.json');
    const refused = { ...accepted, caveats: 'none' };
    const info = (description?: unknown): CardInfo => ({
        label: 'OECD CRS · 3 indicator(s)',
        sourceId: null,
        sourceName: null,
        sourceCount: 1,
        indicatorCount: 3,
        years: null,
        unit: null,
        licence: null,
        dataThrough: null,
        lastRefreshed: null,
        description,
    });
    const keyNumber = (id: string, revision: number, description: unknown): Widget => ({
        kind: 'key_number',
        id,
        label: '',
        value: '',
        ref: { component_id: 'cmp_Ab3dE5gH7k', revision },
        info: info(description),
    });
    const logged = refusalsIn(() =>
        logRefusedDescriptions([
            keyNumber('a', 2, refused),
            keyNumber('b', 2, refused),
            keyNumber('c', 3, refused),
            keyNumber('d', 4, accepted),
            { kind: 'key_number', id: 'e', label: '', value: '', info: info() },
            { kind: 'text', id: 'f', title: '', body: '' },
        ]),
    );

    assert.deepEqual(logged, [
        { componentId: 'cmp_Ab3dE5gH7k', revision: 2, reason: 'unreadable caveats' },
        { componentId: 'cmp_Ab3dE5gH7k', revision: 3, reason: 'unreadable caveats' },
    ]);
});

test("a described source card lists its description's sources", () => {
    const input = vectorInput('description-card-revision.json');
    const [source] = input['sources'] as Record<string, unknown>[];
    const sourceCard = (payload: Record<string, unknown>) =>
        widgetFromComponent({ ...createdFrame(payload), type: 'source_card' });
    const described = sourceCard({
        description: {
            ...input,
            sources: [
                { ...source, publisher: 'OECD', licence: 'OECD Terms and Conditions' },
                {
                    ref: 'dc/base/WorldDevelopmentIndicators',
                    label: 'World Development Indicators',
                    licence: null,
                },
                { ref: 'provenance/Other', label: 'Other source', licence: null },
            ],
            gaps: ['sources.1.licence'],
        },
    });

    assert.equal(
        described?.kind === 'text' && described.body,
        [
            'OECD Creditor Reporting System (CRS) — OECD (OECD Terms and Conditions)',
            'World Development Indicators (licence unknown)',
            'Other source (no licence)',
        ].join('\n'),
    );
});
