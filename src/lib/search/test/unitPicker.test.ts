/* eslint-disable @typescript-eslint/no-explicit-any -- reads the flattened wire Spec */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDatasetEntries } from '../datasetEntries.ts';
import { currencyName } from '../tokenAbout.ts';
import type { HydratedPart, UnitConversion } from '../types.ts';
import {
    currencyMatches,
    currencyRequest,
    currentUnit,
    priceBases,
    pricesRequest,
    servesRequest,
    sharedOffer,
    sharedUnitEdit,
    stagedUnit,
    unitConversion,
    unitPresets,
    validBaseYear,
} from '../unitPicker.ts';
import {
    unitAid,
    unitAidEuroConstant,
    unitAidLoans,
    unitDebt,
    unitHealth,
} from './fixtures/unit-conversion.ts';
import { definite, resolution } from './fixtures/resolution.ts';

const specOf = (body: unknown): any => definite(resolution(body).parts[0]).spec;

/** `body`'s parts as the page hydrates them, each spec as served. */
const hydratedParts = (body: unknown): HydratedPart[] =>
    resolution(body).parts.map((part: any, index: number) => ({
        index,
        variableText: part.variable_text ?? null,
        part,
        hydratedSpec: part.spec ?? null,
        observationsPending: false,
        phase: 'done',
        editError: null,
    }));

const aid = specOf(unitAid);
const aidEuroConstant = specOf(unitAidEuroConstant);
const aidOffer = unitConversion(aid)!;

/** `offer` with each listed currency's entry patched, or dropped for null. */
const patchOffer = (
    offer: UnitConversion,
    patches: Record<string, Partial<UnitConversion['currencies'][number]> | null>,
): UnitConversion => ({
    ...offer,
    currencies: offer.currencies.flatMap((currency) => {
        const patch = patches[currency.code];

        if (patch === null) return [];

        return [{ ...currency, ...patch }];
    }),
});

test('unitPresets names role currencies by their entity and dedupes by code', () => {
    assert.deepEqual(
        unitPresets(aid, aidOffer).map(({ code, label, currency }) => [code, label, currency]),
        [
            ['USD', 'US dollars', 'USD'],
            ['EUR', "Germany's currency: euros", 'EUR'],
            ['GTQ', "Guatemala's currency: Guatemalan quetzales", 'GTQ'],
        ],
    );
    assert.deepEqual(
        unitPresets(specOf(unitDebt), unitConversion(specOf(unitDebt))).map(({ label }) => label),
        ['US dollars', 'Euros', "Ghana's currency: Ghanaian cedis"],
    );
});

test("unitPresets keeps a row for the answer's own currency", () => {
    const yen = {
        ...aidEuroConstant,
        identity: {
            ...aidEuroConstant.identity,
            facets: {
                unit: {
                    state: 'value',
                    request: { currency: 'JPY', prices: 'constant', base_year: 2024 },
                },
            },
        },
    };

    assert.deepEqual(unitPresets(yen, unitConversion(yen)).at(-1), {
        code: 'JPY',
        label: 'Japanese yen',
        currency: 'JPY',
    });
    assert.equal(unitPresets(aid, aidOffer).length, 3);
});

test('unitPresets falls back to the role request when the role names no single entity', () => {
    const spec = { ...aid, entities: aid.entities.filter((e: any) => e.role !== 'destination') };
    const recipient = unitPresets(spec, unitConversion(spec)).find(
        (preset) => preset.code === 'GTQ',
    );

    assert.deepEqual(recipient, {
        code: 'GTQ',
        label: "Recipient's currency: Guatemalan quetzales",
        currency: { role: 'destination' },
    });
});

test('an answer that cannot be converted offers no picker', () => {
    const health = specOf(unitHealth);

    assert.equal(unitConversion(health), null);
    assert.deepEqual(unitPresets(health, unitConversion(health)), []);
    assert.deepEqual(currencyMatches(unitConversion(health), 'yen'), []);
});

test('currentUnit reads the unit request, else the served currency at its measure basis', () => {
    assert.deepEqual(currentUnit(aid), { currency: 'USD', prices: 'current', baseYear: null });
    assert.deepEqual(currentUnit(aidEuroConstant), {
        currency: 'EUR',
        prices: 'constant',
        baseYear: 2024,
    });
});

test('a currency pick keeps the price basis and a price pick keeps the currency', () => {
    const conversion = unitConversion(aid)!;

    assert.deepEqual(currencyRequest(currentUnit(aid), 'EUR', conversion), {
        currency: 'EUR',
        prices: 'current',
    });
    assert.deepEqual(currencyRequest(currentUnit(aidEuroConstant), 'JPY', conversion), {
        currency: 'JPY',
        prices: 'constant',
        base_year: 2024,
    });
    // "Constant" and 2024 staged in the switch, then a euro pick.
    assert.deepEqual(
        currencyRequest(stagedUnit(currentUnit(aid), 'constant', 2024), 'EUR', conversion),
        { currency: 'EUR', prices: 'constant', base_year: 2024 },
    );
    // A staged year outside the bounds keeps the answer's basis.
    assert.deepEqual(
        currencyRequest(stagedUnit(currentUnit(aid), 'constant', null), 'EUR', conversion),
        { currency: 'EUR', prices: 'current' },
    );
    assert.deepEqual(pricesRequest(currentUnit(aid), 'constant', 2015), {
        currency: 'USD',
        prices: 'constant',
        base_year: 2015,
    });
    assert.deepEqual(pricesRequest(currentUnit(aidEuroConstant), 'current', 2024), {
        currency: 'EUR',
        prices: 'current',
    });
});

test('a currency pick fits the staged basis and base year to what the currency takes', () => {
    const usd = currentUnit(aid);
    // "Constant" and 1970 staged under US dollars, whose base years start in
    // 1960, then a quetzal pick: quetzals' base years start in 1980.
    const staged = stagedUnit(usd, 'constant', validBaseYear('1970', priceBases(aidOffer, 'USD')));

    assert.deepEqual(currencyRequest(staged, 'GTQ', aidOffer), {
        currency: 'GTQ',
        prices: 'constant',
        base_year: 1980,
    });
    assert.equal(
        servesRequest(aidOffer, { currency: 'GTQ', prices: 'constant', base_year: 1970 }),
        false,
    );
    assert.equal(
        servesRequest(aidOffer, { currency: 'USD', prices: 'constant', base_year: 1970 }),
        true,
    );
    // A role request reads the role's currency: the recipient's is GTQ.
    assert.deepEqual(currencyRequest(staged, { role: 'destination' }, aidOffer), {
        currency: { role: 'destination' },
        prices: 'constant',
        base_year: 1980,
    });

    // Current prices on a currency with constant prices alone.
    const constantOnly = patchOffer(aidOffer, { GTQ: { current_years: null } });

    assert.deepEqual(currencyRequest(usd, 'GTQ', constantOnly), {
        currency: 'GTQ',
        prices: 'constant',
        base_year: 2024,
    });
    assert.equal(servesRequest(constantOnly, { currency: 'GTQ', prices: 'current' }), false);

    // Constant prices on a currency with current prices alone.
    const currentOnly = patchOffer(aidOffer, {
        GTQ: { constant_years: null, base_year_min: null, base_year_max: null },
    });

    assert.deepEqual(currencyRequest(staged, 'GTQ', currentOnly), {
        currency: 'GTQ',
        prices: 'current',
    });

    // A currency at neither basis takes no request.
    const neither = patchOffer(currentOnly, { GTQ: { current_years: null } });

    assert.equal(currencyRequest(staged, 'GTQ', neither), null);
});

test('sharedOffer offers what every part serves', () => {
    const [first, second] = hydratedParts(unitAidLoans).map((part) =>
        unitConversion(part.hydratedSpec)!,
    );
    const narrower: UnitConversion = {
        ...patchOffer(second!, {
            JPY: null,
            GTQ: { base_year_min: 1990 },
            EUR: { current_years: null },
            USD: { constant_years: null, base_year_min: null, base_year_max: null },
        }),
        role_currencies: { ...second!.role_currencies, destination: 'GTQ' },
    };
    const shared = sharedOffer([first!, narrower])!;
    const entry = (code: string) => shared.currencies.find((currency) => currency.code === code);

    assert.equal(entry('JPY'), undefined);
    assert.deepEqual(priceBases(shared, 'GTQ'), {
        current: true,
        baseYears: { min: 1990, max: 2025 },
    });
    assert.deepEqual(priceBases(shared, 'EUR'), {
        current: false,
        baseYears: { min: 1973, max: 2025 },
    });
    assert.deepEqual(priceBases(shared, 'USD'), { current: true, baseYears: null });
    // The parts disagree on the recipient's currency, so no role row offers it.
    assert.deepEqual(shared.role_currencies, { origin: 'EUR' });
    assert.ok(currencyMatches(shared, 'yen').length === 0);

    // One offer is its own shared offer; no offer shares nothing.
    assert.deepEqual(sharedOffer([first!]), first);
    assert.equal(sharedOffer([]), null);
});

test('currencyMatches searches the convertible currencies by noun and code', () => {
    assert.deepEqual(currencyMatches(aidOffer, 'yen'), [{ code: 'JPY', name: 'Japanese yen' }]);
    assert.deepEqual(currencyMatches(aidOffer, 'quetzales'), [
        { code: 'GTQ', name: 'Guatemalan quetzales' },
    ]);
    assert.ok(currencyMatches(aidOffer, 'gtq').some((option) => option.code === 'GTQ'));
    assert.deepEqual(currencyMatches(aidOffer, '  '), []);
});

test("currencyName takes the offer's noun, else the runtime's name, else the code", () => {
    const conversion = unitConversion(aid);

    assert.equal(currencyName('GTQ', conversion), 'Guatemalan quetzales');
    assert.equal(currencyName('GTQ', null), 'Guatemalan Quetzal');
    assert.equal(currencyName('XQQ', conversion), 'XQQ');
});

test("priceBases and validBaseYear read the picked currency's own bounds", () => {
    const conversion = unitConversion(aid)!;

    // GTQ's base years start in 1980; US dollars' in 1960.
    assert.deepEqual(priceBases(conversion, 'GTQ'), {
        current: true,
        baseYears: { min: 1980, max: 2025 },
    });
    assert.equal(validBaseYear('1970', priceBases(conversion, 'USD')), 1970);
    assert.equal(validBaseYear('1970', priceBases(conversion, 'GTQ')), null);
    assert.equal(validBaseYear('2026', priceBases(conversion, 'GTQ')), null);
    assert.equal(validBaseYear('15', priceBases(conversion, 'GTQ')), null);
    assert.deepEqual(priceBases(conversion, 'XQQ'), { current: false, baseYears: null });
});

test('a currency with no current-price years offers constant prices alone', () => {
    const conversion = unitConversion(aid)!;
    const constantOnly = {
        ...conversion,
        currencies: conversion.currencies.map((currency) =>
            currency.code === 'GTQ' ? { ...currency, current_years: null } : currency,
        ),
    };

    assert.equal(priceBases(constantOnly, 'GTQ').current, false);
    assert.equal(validBaseYear('2015', priceBases(constantOnly, 'GTQ')), 2015);
});

test('a pick on the shared unit token applies to every part that converts', () => {
    const body: any = unitAidLoans;
    const unitTokens = body.sentence_plan.filter((token: any) => token.axis === 'unit');

    // The fixture's premise: one hoisted unit token over two convertible parts.
    assert.deepEqual(
        unitTokens.map((token: any) => token.part_index ?? null),
        [null],
    );

    const parts = hydratedParts(body);
    const request = { currency: 'EUR', prices: 'constant', base_year: 2020 } as const;
    const edit = sharedUnitEdit(parts, request)!;
    const units = (rows: HydratedPart[], override = edit.override) =>
        buildDatasetEntries(rows, override).map((entry: any) => entry.identity.facets?.unit);

    assert.deepEqual(edit.touched, [0, 1]);
    assert.deepEqual(units(parts), [
        { state: 'value', request },
        { state: 'value', request },
    ]);

    // A part whose answer cannot be converted keeps its unit.
    const mixed = parts.map((part) =>
        part.index === 1
            ? { ...part, hydratedSpec: { ...part.hydratedSpec!, unit_conversion: null } }
            : part,
    );
    const mixedEdit = sharedUnitEdit(mixed, request)!;

    assert.deepEqual(mixedEdit.touched, [0]);
    assert.deepEqual(units(mixed, mixedEdit.override), [{ state: 'value', request }, undefined]);
    assert.equal(
        sharedUnitEdit(
            mixed.map((part) => ({
                ...part,
                hydratedSpec: { ...part.hydratedSpec!, unit_conversion: null },
            })),
            request,
        ),
        null,
    );
});

test('a shared pick goes out only when every part serves it', () => {
    const parts = hydratedParts(unitAidLoans).map((part) =>
        part.index === 1
            ? {
                  ...part,
                  hydratedSpec: {
                      ...part.hydratedSpec!,
                      unit_conversion: patchOffer(unitConversion(part.hydratedSpec)!, {
                          GTQ: { base_year_min: 1990 },
                          JPY: null,
                      }),
                  },
              }
            : part,
    );

    assert.equal(
        sharedUnitEdit(parts, { currency: 'GTQ', prices: 'constant', base_year: 1985 }),
        null,
    );
    assert.equal(sharedUnitEdit(parts, { currency: 'JPY', prices: 'current' }), null);
    assert.deepEqual(
        sharedUnitEdit(parts, { currency: 'GTQ', prices: 'constant', base_year: 1990 })?.touched,
        [0, 1],
    );
});
