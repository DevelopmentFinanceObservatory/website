import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CardInfo } from '../../chat/widgets.ts';
import { cardDataDates, dataThroughText, latestPeriod } from '../dataThrough.ts';

const info = (partial: Partial<CardInfo>): CardInfo => ({
    label: 'OECD CRS',
    sourceId: null,
    sourceName: null,
    sourceCount: 1,
    indicatorCount: 1,
    years: null,
    unit: null,
    licence: null,
    dataThrough: null,
    lastRefreshed: null,
    ...partial,
});

// A described card as dfo-apis serves it, whose latest period is 2024.
const described: unknown = JSON.parse(
    readFileSync(
        new URL('./fixtures/descriptions/description-card-revision.json', import.meta.url),
        'utf8',
    ),
).input;

test("a card's data runs through its provenance's period, else its description's", () => {
    assert.deepEqual(cardDataDates(info({ dataThrough: '2023', lastRefreshed: '2026-10-01' })), {
        dataThrough: '2023',
        lastRefreshed: '2026-10-01',
    });
    assert.deepEqual(cardDataDates(info({ dataThrough: '', description: described })), {
        dataThrough: '2024',
        lastRefreshed: null,
    });
    assert.deepEqual(cardDataDates(info({ description: { refused: true } })), {
        dataThrough: null,
        lastRefreshed: null,
    });
    assert.deepEqual(cardDataDates(undefined), { dataThrough: null, lastRefreshed: null });
});

test('the cards read as one period, or as the earliest and latest by the day each ends', () => {
    const cases: [(string | null)[], string | null][] = [
        [[], null],
        [[null, null], null],
        [['2024', null, '2024'], '2024'],
        [['2024', '2022', '2023'], '2022–2024'],
        [['2018/2022', '2024-Q3'], '2022–2024-Q3'],
        // A year runs to December, after its months, quarters and halves.
        [['2024', '2024-06', '2024-Q1'], '2024-Q1–2024'],
        [['2024-H1', '2024-05-31', '2023-12'], '2023-12–2024-H1'],
    ];

    for (const [periods, expected] of cases) {
        assert.equal(dataThroughText(periods), expected, JSON.stringify(periods));
    }
});

test('a live canvas names its latest period, and whether every card reaches it', () => {
    assert.equal(latestPeriod([null]), null);
    assert.deepEqual(latestPeriod(['2024', null, '2024']), { period: '2024', shared: true });
    assert.deepEqual(latestPeriod(['2024', '2024-06', '2022']), { period: '2024', shared: false });
});
