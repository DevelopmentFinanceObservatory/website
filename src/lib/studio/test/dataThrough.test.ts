import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CardInfo } from '../../chat/widgets.ts';
import { cardDataDates, dataThroughText } from '../dataThrough.ts';

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

test('the cards read as one period, or as their earliest and latest', () => {
    const cases: [(string | null)[], string | null][] = [
        [[], null],
        [[null, null], null],
        [['2024', null, '2024'], '2024'],
        [['2024', '2022', '2023'], '2022–2024'],
        [['2018/2022', '2024-Q3'], '2022–2024-Q3'],
    ];

    for (const [periods, expected] of cases) {
        assert.equal(dataThroughText(periods), expected, JSON.stringify(periods));
    }
});
