/**
 * `sentence.ts` over the test documents: a pattern read as text and term
 * references. Expected strings were read from the fixture documents.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import { patternSentence } from '../sentence.ts';
import type { SentencePart } from '../sentence.ts';
import { readSchema, readUsage } from '../wire.ts';
import { schemaBody, usageBody } from './fixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));

const patternOf = (dataset: string, index: number) => {
    const pattern = model.dataset(dataset)?.patterns[index];
    assert.ok(pattern, `no pattern ${index} in ${dataset}`);
    return pattern;
};

const read = (parts: readonly SentencePart[]): string =>
    parts.map((part) => (part.kind === 'text' ? part.text : part.label)).join('');

test('two observation properties read as "between", several constraints as "split by"', () => {
    const parts = patternSentence(model, patternOf('provenance/OECDDAC2A', 0));
    assert.equal(
        read(parts),
        'The amount of a financial flow, measured as Nominal, between financing provider and ' +
            'financing recipient, split by DAC 2a aid type, DAC type of finance, ' +
            'financial flow type and netting basis.',
    );
    assert.deepEqual(
        parts.filter((part) => part.kind === 'term').map((part) => part.id),
        [
            'amount',
            'FinancialFlow',
            'Nominal',
            'financingProvider',
            'financingRecipient',
            'dac2aAidType',
            'dacTypeOfFinance',
            'financialFlowType',
            'nettingBasis',
        ],
    );
});

test('one observation property reads as "reported by"', () => {
    assert.equal(
        read(patternSentence(model, patternOf('provenance/OECDDAC1', 0))),
        'The amount of a financial flow, measured as Nominal, reported by financing provider, ' +
            'split by DAC 1 aid type, financial flow type and netting basis.',
    );
});

test('clauses with nothing to say are left out', () => {
    const base = patternOf('provenance/OECDDAC1', 0);
    const bare = {
        ...base,
        measurement_qualifier: null,
        observation_properties: [],
        constraint_properties: ['nettingBasis'],
    };
    assert.equal(
        read(patternSentence(model, bare)),
        'The amount of a financial flow, split by netting basis.',
    );

    const noPopulation = { ...bare, population_type: null, constraint_properties: [] };
    assert.equal(read(patternSentence(model, noPopulation)), 'The amount.');
});
