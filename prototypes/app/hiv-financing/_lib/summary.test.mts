import assert from 'node:assert/strict';
import test from 'node:test';

import { DATA, KENYA, MEXICO } from './fixture.mts';
import { lastShares, lastYear, ledeFigures, scopeSeries, seriesTotals } from './summary.ts';

test("the lede's majority counts only a US or a Global Fund majority", () => {
    // Kenya (US), Côte d'Ivoire (Global Fund) and Ukraine (US) count; DR Congo, where all
    // other providers gave 56%, does not. The Republic of the Congo is under $1m.
    const { usGfShare, ...counts } = ledeFigures(DATA);

    assert.ok(Math.abs(usGfShare - 6.4 / 6.447) < 1e-12);
    assert.deepEqual(counts, { over1m: 4, oneProviderMajority: 3 });
});

test('scopeSeries shows allocated money for all countries, else the country, else allocated', () => {
    assert.equal(scopeSeries(DATA, null), DATA.allocated);
    assert.equal(scopeSeries(DATA, 'KEN'), KENYA.aid);
    assert.equal(scopeSeries(DATA, 'XXX'), DATA.allocated);
});

test('totals and shares by year; shares are 0 with no aid', () => {
    assert.deepEqual(seriesTotals(KENYA.aid), [360e6, 304e6]);
    assert.deepEqual(lastShares(MEXICO.aid), { us: 0, globalFund: 0, other: 0 });
});

test('the last year comes from the data', () => {
    assert.equal(lastYear(DATA), 2024);
    assert.equal(lastYear({ years: [2016, 2023] }), 2023);
    assert.throws(() => lastYear({ years: [] }));
});
