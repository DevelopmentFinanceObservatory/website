import assert from 'node:assert/strict';
import test from 'node:test';

import { country, DATA, IVORY_COAST, KENYA, MEXICO } from './fixture.mts';
import {
    aidPerPerson,
    gfMultiFlag,
    lastShares,
    lastYear,
    ledeFigures,
    scopeMulti,
    scopeSeries,
    seriesTotals,
} from './summary.ts';

test("the lede's split counts US and Global Fund majorities, flagged US majorities and US zeros", () => {
    // Kenya (US, with multi-disease grants), Côte d'Ivoire (Global Fund) and Ukraine (US)
    // count; DR Congo, where all other providers gave 56%, counts in neither. The Republic of
    // the Congo is under $1m. Zeta has Global Fund money only.
    const zeta = country({ iso3: 'ZZZ', aid: { us: [0, 0], globalFund: [0, 5e6], other: [0, 0] } });
    const { usGfShare, ...counts } = ledeFigures({ ...DATA, countries: [...DATA.countries, zeta] });

    assert.ok(Math.abs(usGfShare - 6.4 / 6.447) < 1e-12);
    assert.deepEqual(counts, {
        over1m: 5,
        gfMajority: 2,
        usMajority: 2,
        usMajorityGfMulti: 1,
    });
});

test('scopeMulti and gfMultiFlag read the Global Fund multi-disease grants', () => {
    assert.equal(scopeMulti(DATA, null), DATA.globalFundMulti);
    assert.equal(scopeMulti(DATA, 'KEN'), KENYA.globalFundMulti);
    assert.equal(scopeMulti(DATA, 'XXX'), DATA.globalFundMulti);
    assert.equal(gfMultiFlag(KENYA), true);
    assert.equal(gfMultiFlag(IVORY_COAST), false);
});

test('aid per person is blank under 5,000 people living with HIV', () => {
    const small = (plhiv: number) =>
        aidPerPerson(country({ aid: { us: [0, 1e6], globalFund: [0, 0], other: [0, 0] }, plhiv }));

    assert.equal(small(4_999), null);
    assert.equal(small(5_000), 200);
    assert.equal(aidPerPerson(country()), null);
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
