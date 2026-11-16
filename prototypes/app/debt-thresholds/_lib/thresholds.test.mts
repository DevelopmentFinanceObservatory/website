import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { BaseYear, Capacity, Country, FdlGroup, ThresholdsData } from '../_data/types.ts';
import {
    classify,
    debtRatio,
    effectiveCapacity,
    endYear,
    fdlCounts,
    fdlMatch,
    groupCounts,
    isStaleRating,
    listOf,
    movers,
    peakService,
    sentence,
    serviceRatios,
    shownGroup,
    THRESHOLDS,
    toCsv,
} from './thresholds.ts';

const envelope = JSON.parse(
    readFileSync(new URL('../_data/fixture.json', import.meta.url), 'utf8'),
) as { provenance: Record<string, string>; data: ThresholdsData };
const { countries } = envelope.data;

const country = (iso3: string): Country => {
    const found = countries.find((candidate) => candidate.iso3 === iso3);
    assert.ok(found, `${iso3} is in the fixture`);

    return found;
};
const base = (iso3: string, year: number): BaseYear => {
    const found = country(iso3).bases[String(year)];
    assert.ok(found, `${iso3} has base year ${year}`);

    return found;
};

const closeTo = (actual: number | null | undefined, expected: number) =>
    assert.ok(
        actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-6,
        `${actual} is not ${expected}`,
    );

const CAPACITIES: Capacity[] = ['weak', 'medium', 'strong'];
const SPLIT = { multilateral: 0.3, imf: 0.1, bilateral: 0.15, china: 0.25, private: 0.2 };

/** A one-country case: debt of `debt`% of GDP, and a service ratio of `ratios` by year. */
const synthetic = (
    debt: number,
    ratios: Record<number, number | null>,
    {
        baseYear = 2024,
        capacity = 'medium',
        fdl2024 = null,
    }: { baseYear?: number; capacity?: Capacity | null; fdl2024?: FdlGroup | null } = {},
): Country => ({
    iso3: 'TST',
    name: 'Test',
    fdl2024,
    bases: {
        [baseYear]: {
            year: baseYear,
            debtFace: debt * 12,
            debtPV: debt * 10,
            gdp: 1000,
            capacity,
            capacitySource: capacity === null ? null : 'dsa',
            dsaDate: null,
            riskRating: null,
            years: Object.entries(ratios).map(([year, ratio]) => ({
                year: Number(year),
                projected: Number(year) > baseYear,
                revenue: 100,
                service:
                    ratio === null
                        ? null
                        : { multilateral: ratio, imf: 0, bilateral: 0, china: 0, private: 0 },
            })),
        },
    },
});

test('the fixture is a valid envelope with a group for every case and six projected years', () => {
    assert.ok(
        envelope.provenance.sdk && envelope.provenance.query && envelope.provenance.retrieved,
    );
    assert.equal(envelope.data.measure, 'pv');
    assert.deepEqual(
        countries.map((c) => classify(c, 2024, effectiveCapacity(c, 2024, 'assessed'))),
        ['service', 'debt', 'debt', 'below', 'nodata'],
    );
    for (const year of envelope.data.baseYears) {
        const years = base('KEN', year).years.map((row) => row.year);

        assert.deepEqual(
            years,
            Array.from({ length: 15 }, (_, i) => year - 8 + i),
        );
        assert.ok(envelope.data.vintages[String(year)]);
    }
});

test('THRESHOLDS holds FDL values', () => {
    assert.deepEqual(THRESHOLDS.debt, { weak: 30, medium: 40, strong: 55 });
    assert.deepEqual(THRESHOLDS.service, { weak: 14, medium: 18, strong: 23 });
});

for (const capacity of CAPACITIES) {
    test(`${capacity}: the debt threshold is strict`, () => {
        const limit = THRESHOLDS.debt[capacity];
        const flat = { 2024: 1, 2025: 1 };

        assert.equal(classify(synthetic(limit, flat), 2024, capacity), 'below');
        assert.equal(classify(synthetic(limit + 0.1, flat), 2024, capacity), 'debt');
    });

    test(`${capacity}: the service threshold is strict in the base year and a projected year`, () => {
        const limit = THRESHOLDS.service[capacity];

        assert.equal(
            classify(synthetic(10, { 2024: limit, 2030: limit }), 2024, capacity),
            'below',
        );
        assert.equal(
            classify(synthetic(10, { 2024: limit + 0.1, 2030: 1 }), 2024, capacity),
            'service',
        );
        assert.equal(
            classify(synthetic(10, { 2024: 1, 2030: limit + 0.1 }), 2024, capacity),
            'service',
        );
    });
}

test('the debt test comes before the service test', () => {
    assert.equal(classify(synthetic(90, { 2024: 99, 2030: 99 }), 2024, 'strong'), 'debt');
});

test('a breach in a year before the base year does not count', () => {
    const early = synthetic(10, { 2020: 99, 2024: 1, 2030: 1 });

    assert.equal(classify(early, 2024, 'weak'), 'below');
    assert.equal(peakService(early.bases['2024']!)?.ratio, 1);
});

test('the service test runs to the last year in the data, past 2030', () => {
    const late = synthetic(10, { 2025: 1, 2030: 1, 2031: 30 }, { baseYear: 2025 });

    assert.equal(endYear(late.bases['2025']!), 2031);
    assert.equal(classify(late, 2025, 'strong'), 'service');
    assert.equal(peakService(late.bases['2025']!)?.year, 2031);
});

test('projected-year breach: Kenya is below in 2024 and over the service threshold by 2028', () => {
    const kenya = country('KEN');
    const ratios = serviceRatios(base('KEN', 2024));

    closeTo(ratios.find((r) => r.year === 2024)?.ratio, 15);
    assert.equal(classify(kenya, 2024, 'medium'), 'service');
    assert.equal(classify(kenya, 2024, 'strong'), 'below');
    assert.deepEqual(
        { ...peakService(base('KEN', 2024)), ratio: 0 },
        { year: 2028, projected: true, ratio: 0 },
    );
});

test('nodata: missing capacity, base year, debt, GDP or base-year service', () => {
    const ok = synthetic(10, { 2024: 1, 2030: 1 });
    const noGdp = { ...ok, bases: { 2024: { ...ok.bases['2024']!, gdp: 0 } } };
    const noRevenue = synthetic(10, { 2024: null, 2030: 1 });
    const noProjection = synthetic(10, { 2024: 1, 2030: null });

    assert.equal(classify(ok, 2024, null), 'nodata');
    assert.equal(classify(ok, 2019, 'medium'), 'nodata');
    assert.equal(classify(country('XBB'), 2024, 'medium'), 'nodata');
    assert.equal(classify(noGdp, 2024, 'medium'), 'nodata');
    assert.equal(classify(noRevenue, 2024, 'medium'), 'nodata');
    assert.equal(classify(noProjection, 2024, 'medium'), 'below');
    assert.equal(peakService(noRevenue.bases['2024']!)?.year, 2030);
});

test('capacity is read from the base year', () => {
    const testland = country('XAA');

    assert.equal(effectiveCapacity(testland, 2024, 'assessed'), 'strong');
    assert.equal(effectiveCapacity(testland, 2025, 'assessed'), 'medium');
    assert.equal(effectiveCapacity(country('XBB'), 2025, 'assessed'), null);
    assert.equal(effectiveCapacity(testland, 2025, 'weak'), 'weak');
    assert.equal(effectiveCapacity(testland, 2019, 'assessed'), null);
});

test('serviceRatios splits the total by creditor and divides by revenue', () => {
    const row = serviceRatios(base('SEN', 2024)).find((r) => r.year === 2030);
    assert.ok(row?.byCreditor);

    closeTo(row.ratio, 23);
    closeTo(row.byCreditor.china, 23 * SPLIT.china);
    assert.equal(row.projected, true);
    assert.equal(serviceRatios(base('XBB', 2024))[0]?.byCreditor, null);
});

test('golden rows for Kenya, Zambia and Senegal', () => {
    closeTo(debtRatio(base('KEN', 2024)), 30);
    closeTo(peakService(base('KEN', 2024))?.ratio, 21);
    closeTo(debtRatio(base('ZMB', 2024)), (17 / 28) * 100);
    closeTo(debtRatio(base('ZMB', 2025)), (17.5 / 30) * 100);
    assert.equal(classify(country('ZMB'), 2025, 'weak'), 'debt');
    closeTo(debtRatio(base('SEN', 2024)), (20 / 31) * 100);
    assert.equal(classify(country('SEN'), 2024, 'medium'), 'debt');
});

test("shownGroup uses FDL's published group only in FDL's view", () => {
    const differs = synthetic(10, { 2024: 1, 2030: 1 }, { fdl2024: 'insolvent' });

    assert.equal(shownGroup(differs, 2024, 'assessed'), 'debt');
    assert.equal(shownGroup(differs, 2024, 'medium'), 'below');
    assert.equal(shownGroup(country('XBB'), 2024, 'assessed'), 'nodata');
    assert.equal(shownGroup(country('KEN'), 2025, 'assessed'), 'service');
});

test('fdlMatch compares the rebuild of 2024 with FDL and lists each mismatch', () => {
    const same = { ...synthetic(50, { 2024: 1 }, { fdl2024: 'insolvent' }), iso3: 'AAA' };
    const differs = { ...synthetic(10, { 2024: 1 }, { fdl2024: 'insolvent' }), iso3: 'BBB' };
    const ungrouped = { ...synthetic(10, { 2024: 1 }), iso3: 'CCC' };
    const result = fdlMatch([same, differs, ungrouped]);

    assert.equal(result.matched, 1);
    assert.equal(result.total, 2);
    assert.deepEqual(
        result.mismatches.map(({ country: c, fdl, rebuilt }) => [c.iso3, fdl, rebuilt]),
        [['BBB', 'debt', 'below']],
    );
});

test("groupCounts follows the page's groups; fdlCounts counts FDL's published ones", () => {
    const differs = synthetic(10, { 2024: 1 }, { fdl2024: 'insolvent' });

    assert.deepEqual(groupCounts([differs], 2024, 'assessed'), {
        debt: 1,
        service: 0,
        below: 0,
        nodata: 0,
    });
    assert.equal(groupCounts([differs], 2024, 'medium').below, 1);
    assert.equal(fdlCounts([differs, synthetic(10, { 2024: 1 })]).debt, 1);
});

test('listOf joins with an Oxford comma from three items', () => {
    assert.equal(listOf(['a']), 'a');
    assert.equal(listOf(['a', 'b']), 'a and b');
    assert.equal(listOf(['a', 'b', 'c']), 'a, b, and c');
});

test('movers', () => {
    assert.deepEqual(movers(countries, 2024, 'assessed'), []);
    assert.deepEqual(
        movers(countries, 2024, 'strong').map((c) => c.iso3),
        ['KEN'],
    );
    assert.deepEqual(movers(countries, 2024, 'weak'), []);

    const unrated = synthetic(50, { 2024: 1, 2030: 1 }, { capacity: null });
    assert.equal(classify(unrated, 2024, 'weak'), 'debt');
    assert.deepEqual(movers([unrated], 2024, 'weak'), []);
});

test("sentences use FDL's terms only in FDL's view, and conditional wording", () => {
    assert.equal(
        sentence(country('ZMB'), 2024, 'assessed'),
        "FDL puts Zambia at risk of insolvency. Zambia's external public debt was 61% of GDP in 2024, above the 30% threshold for weak debt-carrying capacity.",
    );
    assert.equal(
        sentence(country('ZMB'), 2025, 'assessed'),
        "Zambia's external public debt was 58% of GDP in 2025, above the 30% threshold for weak debt-carrying capacity. That meets FDL's test for risk of insolvency.",
    );
    assert.equal(
        sentence(country('KEN'), 2024, 'assessed'),
        "FDL finds Kenya illiquid. Kenya's external debt service would reach 21.0% of government revenue in 2028 on the DFO's projection, above the 18% threshold for medium capacity.",
    );
    assert.equal(
        sentence(country('KEN'), 2024, 'medium'),
        "Kenya's external debt service would reach 21.0% of government revenue in 2028 on the DFO's projection, above the 18% threshold for medium capacity. That meets FDL's test for illiquidity.",
    );
    assert.equal(
        sentence(country('XAA'), 2025, 'assessed'),
        "Testland would stay below both thresholds for medium capacity in every year to 2031 on the DFO's projection, with debt at 30% of GDP and debt service peaking at 9.5% of revenue.",
    );
    assert.match(sentence(country('XBB'), 2024, 'assessed'), /too little data/);
    assert.doesNotMatch(sentence(country('SEN'), 2025, 'assessed'), /FDL puts|FDL finds/);

    const differs = synthetic(10, { 2024: 1, 2030: 1 }, { fdl2024: 'insolvent' });
    assert.match(
        sentence(differs, 2024, 'assessed'),
        /^FDL puts Test at risk of insolvency\. The DFO's rebuild differs. Test would stay below/,
    );

    const actual = synthetic(10, { 2024: 20, 2030: 5 });
    assert.match(
        sentence(actual, 2024, 'assessed'),
        /spent 20\.0% of government revenue .* in 2024/,
    );
});

test('isStaleRating flags a DSA more than two years before the capacity date', () => {
    assert.equal(isStaleRating('2023-06-01', '2026-03-14'), true);
    assert.equal(isStaleRating('2024-03-14', '2026-03-14'), false);
    assert.equal(isStaleRating(null, '2026-03-14'), false);
});

test('toCsv writes one row per country and honours the override', () => {
    const lines = toCsv(countries, 2024, 'assessed').trimEnd().split('\n');

    assert.equal(lines.length, 1 + countries.length);
    assert.equal(
        lines[0],
        'iso3,name,capacity,capacity source,external public debt at present value % of GDP,debt service % of revenue (base year),peak debt service % of revenue,peak year,group,"FDL group, 2024"',
    );
    assert.equal(
        lines[1],
        'KEN,Kenya,medium,dsa,30,15,21,2028,Above the debt-service threshold,illiquid',
    );
    assert.equal(lines[5], 'XBB,Datalessland,medium,dsa,,,,,No data,');
    assert.match(
        toCsv(countries, 2024, 'strong'),
        /KEN,Kenya,strong,override,30,15,21,2028,Below both/,
    );
    assert.match(toCsv(countries, 2025, 'assessed'), /XBB,Datalessland,,,,,,,No data,/);

    const quoted = { ...country('KEN'), name: 'Korea, "Rep."' };
    assert.match(toCsv([quoted], 2024, 'assessed'), /^KEN,"Korea, ""Rep."""/m);
});
