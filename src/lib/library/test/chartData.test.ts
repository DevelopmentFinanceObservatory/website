import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

// Before chartData.ts, which loads next/cache.
import { nextCache } from '../../test/nextCacheStub.ts';
import { SharesError, type SharesBackend } from '../../chat/apisShares.ts';
import { componentRead, DATASET_FRAME } from '../../studio/test/fixtures/component-read.ts';
import describedChart from '../../studio/test/fixtures/descriptions/envelope-line-chart-described.json' with { type: 'json' };
import { libraryChartData, readFailureResponse } from '../chartData.ts';

const artifact = {
    slug: 'health-expenditure',
    shareId: 'Ab3dEf7h',
    title: 'Health expenditure per capita',
    description: 'Health expenditure per person across three countries.',
    sources: [{ name: 'World Development Indicators', url: '/data/sources/wdi' }],
};
const ORIGIN = 'https://developmentfinance.org';
const CSV = '/library/health-expenditure/data.csv';
const countries = [
    { ref: 'country/KEN', label: 'Kenya', value: 91.127 },
    { ref: 'country/LBR', label: 'Liberia', value: 0 },
    { ref: 'country/NER', label: 'Niger', value: 649.3679 },
];

const barChart = (period: string) => ({
    ...describedChart.component,
    type: 'bar_chart',
    category_axis: { mode: 'entity', category_dimension: 'country', period },
    series: countries.map(({ label, value }) => ({
        label,
        unit: 'USD',
        points: [
            { period, value },
            { period: '2022', value: 99 },
        ],
    })),
});

// The same values as a Studio table: one row per country, in its columns.
const countryTable = (period: string) => ({
    type: 'table',
    title: describedChart.component.title,
    columns: [
        { key: 'country', label: 'Country' },
        { key: 'period', label: 'Year' },
        { key: 'value', label: 'Value' },
    ],
    rows: countries.map(({ label, value }) => ({
        series_id: 's_health',
        dimensions: { country: label },
        period,
        unit: 'USD',
        value,
    })),
});

const slotBody = (
    period: string,
    licence: string,
    component: Record<string, unknown> = barChart(period),
) => {
    const body = componentRead('cmp_test', 2, DATASET_FRAME);

    return {
        ...body,
        resolved_payload: {
            ...body.resolved_payload,
            component,
            description: {
                ...describedChart.description,
                about: {
                    measure: { label: 'current health expenditure per capita', definition: null },
                    drawn: {
                        dimensions: [
                            {
                                property: { ref: 'observationAbout', label: 'country' },
                                count: 3,
                                of: 3,
                                values: countries,
                            },
                        ],
                    },
                },
                sources: [
                    {
                        ref: 'provenance/WorldDevelopmentIndicators',
                        label: 'World Development Indicators',
                        licence,
                    },
                ],
            },
        },
    };
};

type Card = { kind: 'chart' | 'table'; view?: string };

const backend = (
    mode: 'live' | 'snapshot',
    slot: () => Response | Promise<Response>,
    card: Card = { kind: 'chart' },
): SharesBackend => ({
    base: 'https://apis.example',
    nameCaller: () => {},
    fetch: async (input) => {
        const path = new URL(String(input)).pathname;

        if (path === '/api/presentation/shares/Ab3dEf7h') {
            return Response.json({
                id: artifact.shareId,
                kind: 'card',
                mode,
                title: artifact.title,
                slots: [
                    {
                        slot: 2,
                        card: { component_id: 'cmp_test', revision: 2, frame: DATASET_FRAME },
                    },
                ],
                payload: {
                    widgets: [{ id: 'health', kind: card.kind, slot: 1 }],
                    ...(card.view ? { views: { health: card.view } } : {}),
                },
                created_at: '2026-11-28T00:00:00Z',
            });
        }

        assert.equal(path, '/api/presentation/shares/Ab3dEf7h/slots/2');

        return slot();
    },
});

beforeEach(nextCache.clear);

test('a pinned country chart publishes only its plotted year, exact values and its slot CSV', async () => {
    const licence = 'https://creativecommons.org/licenses/by/4.0/';
    const data = await libraryChartData(
        backend('snapshot', () => Response.json(slotBody('2023', licence))),
        artifact,
        ORIGIN,
    );

    assert.ok(data);
    assert.deepEqual(
        data.rows,
        countries.map(({ label, value }) => ({
            series: label,
            period: '2023',
            value,
            unit: 'USD',
        })),
    );
    assert.deepEqual([data.seriesHeading, data.periodHeading], ['Country', 'Year']);
    assert.equal(data.dataset.temporalCoverage, '2023');
    assert.equal(data.dataset.variableMeasured, 'current health expenditure per capita');
    assert.deepEqual(data.dataset.isBasedOn, [
        {
            '@type': 'Dataset',
            name: 'World Development Indicators',
            url: `${ORIGIN}/data/sources/wdi`,
            license: licence,
        },
    ]);
    assert.equal(data.dataset.license, licence);
    assert.equal(data.csvHref, CSV);
    assert.deepEqual(data.dataset.distribution, {
        '@type': 'DataDownload',
        encodingFormat: 'text/csv',
        contentUrl: `${ORIGIN}${CSV}`,
    });
});

test('a live chart reports the served period and leaves an unknown licence out', async () => {
    const data = await libraryChartData(
        backend('live', () => Response.json(slotBody('2025-Q2', 'unknown'))),
        artifact,
        ORIGIN,
    );

    assert.ok(data);
    assert.deepEqual(data.window, { start: '2025-Q2', end: '2025-Q2' });
    assert.deepEqual(
        [data.periodHeading, data.dataset.temporalCoverage],
        ['Period', '2025-04/2025-06'],
    );
    assert.equal(data.dataset.license, undefined);
    assert.equal(data.dataset.isBasedOn?.[0].license, undefined);
});

for (const [label, answer, readsAfterTwo] of [
    ['a slot dfo-apis no longer has is kept as no data', 404, 1],
    ['a slot dfo-apis cannot serve for now is read again', 503, 2],
] as const) {
    test(label, async () => {
        let reads = 0;
        const shares = backend('live', () => {
            reads += 1;

            return Response.json({ code: 'refused' }, { status: answer });
        });

        assert.equal(await libraryChartData(shares, artifact, ORIGIN), null);
        assert.equal(await libraryChartData(shares, artifact, ORIGIN), null);
        assert.equal(reads, readsAfterTwo);
    });
}

test('the CSV route answers a failed read under the status it calls for', () => {
    const answers = [
        new SharesError('not_found', { status: 404 }),
        new SharesError('request_invalid', { status: 400 }),
        new SharesError('unprocessable', { status: 422 }),
        new SharesError('rate_limited', { status: 429, retryable: true, retryAfterS: 30 }),
        new SharesError('upstream_error', { status: 500 }),
        new SharesError('backend_unreachable', { retryable: true }),
    ].map((error) => {
        const response = readFailureResponse(error);

        return [response.status, response.headers.get('retry-after')];
    });

    assert.deepEqual(answers, [
        [404, null],
        [400, null],
        [422, null],
        [429, '30'],
        [502, null],
        [502, null],
    ]);
});

const plotted = countries.map(({ label, value }) => ({
    series: label,
    period: '2023',
    value,
    unit: 'USD',
}));

// A key number of the same measure: a card that draws no rows.
const keyNumber = (period: string) => ({
    type: 'stat_card',
    title: describedChart.component.title,
    value: 91.127,
    label: 'Kenya',
    period,
    unit: 'USD',
});

for (const [label, component, card, rows] of [
    ['a table saved as a bar chart', countryTable, { kind: 'table', view: 'chart-bar' }, plotted],
    ['a table in its own view', countryTable, { kind: 'table' }, plotted],
    ['a chart saved as a table', barChart, { kind: 'chart', view: 'chart-table' }, plotted],
    ['a key number', keyNumber, { kind: 'chart' }, null],
] as const) {
    test(`${label} serves the rows its saved view draws`, async () => {
        const data = await libraryChartData(
            backend(
                'snapshot',
                () => Response.json(slotBody('2023', 'CC BY 4.0', component('2023'))),
                card,
            ),
            artifact,
            ORIGIN,
        );

        assert.deepEqual(data?.rows ?? null, rows);
    });
}

test('a slow slot read leaves the page without the table, then fills the cache', async () => {
    let reads = 0;
    let pending: Promise<unknown> | undefined;
    const slow = backend('snapshot', async () => {
        reads += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));

        return Response.json(slotBody('2023', 'unknown'));
    });

    const late = await libraryChartData(slow, artifact, ORIGIN, {
        deadlineMs: 10,
        waitUntil: (read) => {
            pending = read;
        },
    });

    assert.equal(late, null);
    assert.ok(pending);
    await pending;

    const cached = await libraryChartData(slow, artifact, ORIGIN, { deadlineMs: 10 });

    assert.deepEqual(cached?.rows, plotted);
    assert.equal(reads, 1);
});

for (const [label, description, check] of [
    [
        'a one-character description gives way to one built from the chart',
        'x',
        (text: string) => {
            assert.ok(text.length >= 50);

            for (const part of [
                'Current health expenditure per capita',
                'Kenya',
                'Niger',
                '2023',
            ]) {
                assert.ok(text.includes(part), part);
            }

            assert.ok(text.includes('World Development Indicators'));
        },
    ],
    [
        'a long enough description is kept',
        artifact.description,
        (text: string) => assert.equal(text, artifact.description),
    ],
    [
        'a description over 5,000 characters is clipped',
        'word '.repeat(1_200),
        (text: string) => assert.ok(text.length <= 5_000 && text.length > 4_000),
    ],
] as const) {
    test(label, async () => {
        const data = await libraryChartData(
            backend('snapshot', () => Response.json(slotBody('2023', 'unknown'))),
            { ...artifact, description },
            ORIGIN,
        );

        assert.ok(data);
        check(data.dataset.description);
    });
}
