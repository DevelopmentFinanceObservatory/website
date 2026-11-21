import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DatasetRef } from '@developmentfinance/client';

import type { HivData } from '../_data/types.ts';

import {
    AID_KEYS,
    aidFromRows,
    aidRecipes,
    AidRowsError,
    type AidKey,
    type AidNames,
    type AidRow,
    RECIPE_KEYS,
} from './aid.ts';

import { recordOf } from '#lib/record.ts';

const load = <T,>(name: string): T =>
    (JSON.parse(readFileSync(new URL(`../_data/${name}`, import.meta.url), 'utf8')) as { data: T })
        .data;

// The trees and rows of the pinned reads, as fetch.py wrote them, and the figures it derived.
const fixture = load<{
    recipes: Record<string, unknown>;
    rows: Record<
        AidKey,
        {
            unit: Record<string, unknown>;
            rows: [member: string | null, period: string | number, value: number][];
        }
    >;
}>('aid-fixture.json');
const hiv = load<HivData>('hiv.json');
const names = load<AidNames>('names.json');
const liveRefs = load<Record<string, unknown>>('live-refs.json');
const MEMBER: Record<AidKey, string | null> = {
    allocatedByProvider: 'financingProvider',
    unallocatedByProvider: 'financingProvider',
    allocatedByRecipient: 'financingRecipient',
    usByRecipient: 'financingRecipient',
    globalFundByRecipient: 'financingRecipient',
    loans: 'financingProvider',
    gf12250Total: null,
    gf12110Total: null,
    'gf-12250': 'financingRecipient',
    'gf-12110': 'financingRecipient',
};

/** Each recipe's and read's rows, as `Dataset.toRows()` gives them. */
const pinnedRows = (): Record<AidKey, AidRow[]> =>
    recordOf(AID_KEYS, (key) => {
        const { unit, rows } = fixture.rows[key];
        const column = MEMBER[key];

        return rows.map(([member, period, value]) => ({
            ...(column === null ? {} : { [column]: member }),
            time_period: period,
            value,
            ...unit,
        }));
    });

const scope = { years: hiv.years, priceBase: hiv.priceBase, names };

test('the recipes send the trees fetch.py sent', () => {
    const recipes = aidRecipes(
        {
            aid: DatasetRef.fromJSON(liveRefs.aid),
            'gf-12250': DatasetRef.fromJSON(liveRefs['gf-12250']),
            'gf-12110': DatasetRef.fromJSON(liveRefs['gf-12110']),
        },
        [hiv.years[0]!, hiv.years.at(-1)!],
    );

    assert.deepStrictEqual(
        recordOf(RECIPE_KEYS, (key) => recipes[key].tree()),
        fixture.recipes,
    );
});

test('the pinned rows give hiv.json exactly', () => {
    assert.deepStrictEqual(aidFromRows(pinnedRows(), scope), hiv);
});

test('a provider counts by its code, whatever its label', () => {
    const rows = pinnedRows();
    const renamed = {
        ...names,
        providers: { ...names.providers, 'country/USA': 'United States Agency' },
    };

    assert.deepStrictEqual(
        aidFromRows(rows, { ...scope, names: renamed }).allocated,
        hiv.allocated,
    );
});

const refusal = (change: (rows: Record<AidKey, AidRow[]>) => void, code: string) => {
    const rows = pinnedRows();

    change(rows);
    assert.throws(
        () => aidFromRows(rows, scope),
        (error) => error instanceof AidRowsError && error.code === code,
    );
};

test('rows the derivation cannot trust are refused', () => {
    refusal((rows) => {
        rows['gf-12110'].push(rows['gf-12110'][0]!);
    }, 'aid_repeated_row');
    refusal((rows) => {
        rows.allocatedByRecipient[0] = { ...rows.allocatedByRecipient[0]!, value: null };
    }, 'aid_unreadable_row');
    refusal((rows) => {
        rows.loans[0] = {
            ...rows.loans[0]!,
            unit: JSON.stringify({ currency: 'USD', prices: 'current' }),
        };
    }, 'aid_wrong_unit');
    refusal((rows) => {
        rows.allocatedByRecipient.push({
            ...rows.allocatedByRecipient[0]!,
            financingRecipient: 'DACAfricaUnallocated',
        });
    }, 'aid_not_a_country');
    refusal((rows) => {
        rows.loans.push({ ...rows.loans[0]!, financingProvider: 'NewLender' });
    }, 'aid_unnamed');
});

test('a provider without a name is fine where the page prints none', () => {
    const rows = pinnedRows();

    rows.allocatedByProvider.push({
        ...rows.allocatedByProvider[0]!,
        financingProvider: 'SmallDonor',
        value: 10,
    });
    assert.deepStrictEqual(aidFromRows(rows, scope).otherProviders, hiv.otherProviders);
});
