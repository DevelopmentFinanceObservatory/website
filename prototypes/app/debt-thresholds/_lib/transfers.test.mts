import assert from 'node:assert/strict';
import test from 'node:test';

import type { Group } from './thresholds.ts';
import {
    groupTransfers,
    SET_ASIDE_ISO3,
    swing,
    transfersHeading,
    type TransferLine,
    type TransfersData,
} from './transfers.ts';

const YEARS = [2019, 2020, 2021, 2022, 2023];

const data: TransfersData = {
    release: 'test',
    years: YEARS,
    groups: [],
    countries: [
        { iso3: 'AAA', name: 'A', group: 'insolvent', values: [1, 2, null, 4, 5] },
        { iso3: 'BBB', name: 'B', group: 'insolvent', values: [10, null, null, 40, 50] },
        { iso3: 'CCC', name: 'C', group: 'lower-risk', values: [100, 100, 100, 100, 100] },
        { iso3: SET_ASIDE_ISO3, name: 'India', group: 'lower-risk', values: [9, 9, 9, 9, 9] },
        { iso3: 'ZZZ', name: 'Z', group: 'not-in-dsa', values: [7, 7, 7, 7, 7] },
    ],
};

const line = (values: (number | null)[]): TransferLine => ({ key: 'service', members: [], values });

test("groupTransfers regroups countries by the caller's grouping", () => {
    const grouping: Record<string, Group> = { AAA: 'service', BBB: 'service', CCC: 'debt' };
    grouping[SET_ASIDE_ISO3] = 'debt';
    const { lines, aside } = groupTransfers(data, (iso3) => grouping[iso3] ?? null);

    assert.deepEqual(
        lines.map(({ key, members }) => [key, members]),
        [
            ['debt', ['CCC']],
            ['service', ['AAA', 'BBB']],
            ['outside', ['ZZZ']],
        ],
    );
    // A year sums the members that report; a year none reports is null.
    assert.deepEqual(lines[1]?.values, [11, 2, null, 44, 55]);
    assert.equal(aside?.line, 'debt');
    assert.deepEqual(lines[0]?.values, [100, 100, 100, 100, 100]);
});

test('swing finds the inflow before the first outflow and the lowest outflow after it', () => {
    assert.deepEqual(swing(line([30, 50, 10, -4, -8]), YEARS), {
        inflow: { year: 2020, value: 50 },
        outflow: { year: 2023, value: -8 },
    });
    assert.equal(swing(line([5, 5, 5, 5, 5]), YEARS), null);
    assert.equal(swing(line([-1, 5, 5, 5, 5]), YEARS), null);
});

test('transfersHeading states the swing, or asks a question when there is none', () => {
    assert.equal(
        transfersHeading([line([3e9, 52.06e9, 10e9, -11.64e9, 1e9])], YEARS),
        'Countries above the debt-service threshold went from a net inflow of $52.1 billion in 2020 to a net outflow of $11.6 billion in 2022.',
    );
    assert.match(transfersHeading([line([1, 2, 3, 4, 5])], YEARS), /\?$/);
    assert.match(transfersHeading([], YEARS), /\?$/);
});
