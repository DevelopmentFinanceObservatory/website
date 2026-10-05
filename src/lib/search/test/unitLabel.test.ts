/* eslint-disable @typescript-eslint/no-explicit-any -- reads the flattened wire Spec */
import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeResponse } from '../searchClient.ts';
import type { SentenceToken } from '../types.ts';
import { unitWithBasis } from '../unitLabel.ts';
import { detailRows, flattenRows } from '../view.ts';
import { unitAid, unitAidEuroConstant, unitHealth } from './fixtures/unit-conversion.ts';

const envelopeOf = (body: unknown): any => normalizeResponse(body);
const specOf = (body: unknown): any => envelopeOf(body).parts[0].spec;
const bylineUnit = (body: unknown): string | undefined =>
    envelopeOf(body).sentence_plan.find(
        (token: SentenceToken) => token.axis === 'unit' && token.segment === 'byline',
    )?.text;

const conversion = { recipe_id: 'r', exchange_rate_table_version: '1' };

const withSeries = (spec: any, unit: unknown, converted = true): any => ({
    ...spec,
    observations: {
        series: [
            {
                points: [{ date: '2020', value: 1 }],
                facet: unit ? { unit } : {},
                ...(converted ? { conversion } : {}),
            },
        ],
    },
});

for (const [name, body, text] of [
    ['native', unitAid, 'Current US dollars'],
    ['converted', unitAidEuroConstant, 'Constant 2024 euros'],
] as const) {
    test(`a ${name} answer names its unit as the byline does`, () => {
        const spec = specOf(body);

        assert.equal(bylineUnit(body), text);
        assert.equal(unitWithBasis(spec), text);
        assert.deepEqual(
            detailRows(spec).filter((row) => row.label === 'Unit'),
            [{ label: 'Unit', value: text }],
        );
        assert.deepEqual(
            flattenRows(withSeries(spec, spec.facets.unit)).map((row) => row.unit),
            [text],
        );
    });
}

test('the byline unit token on the spec wins over the composed text', () => {
    const spec = {
        ...specOf(unitAidEuroConstant),
        sentence_plan: [
            { kind: 'slot', axis: 'unit', segment: 'byline', text: 'Constant 2020 euros' },
        ],
    };

    assert.equal(unitWithBasis(spec), 'Constant 2020 euros');
});

test('a preview with no conversion record keeps the series unit although the identity asks for one', () => {
    const spec = specOf(unitAidEuroConstant);

    assert.equal(spec.identity.facets.unit.request.prices, 'constant');
    assert.deepEqual(
        flattenRows(withSeries(spec, { ref: 'CurrencyUSD', label: 'US Dollar' }, false)).map(
            (row) => row.unit,
        ),
        ['US Dollar'],
    );
});

test('a unit that is no currency keeps its label', () => {
    const spec = specOf(unitHealth);

    assert.equal(unitWithBasis(spec), null);
    assert.deepEqual(
        detailRows(spec).filter((row) => row.label === 'Unit'),
        [{ label: 'Unit', value: 'International Dollar' }],
    );
});
