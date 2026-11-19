/**
 * `sentence.ts` over the test documents: patterns grouped by split
 * combination, and a group or pattern read as text and term references.
 * Expected strings were read from the fixture documents.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel, type Model } from '../model.ts';
import { groupSentence, patternGroups, patternLine, patternSentence } from '../sentence.ts';
import type { SentencePart } from '../sentence.ts';
import { readSchema, readUsage, type SchemaPattern } from '../wire.ts';
import { baseUsageBody, schemaBody, unUsageBody, usageBody } from './fixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));

/** The DFO, base and UN System test documents in one model. */
const everyModel = buildModel(
    readSchema(schemaBody()),
    readUsage(usageBody()),
    readUsage(baseUsageBody()),
    readUsage(unUsageBody()),
);

const patternOf = (dataset: string, index: number, held: Model = model) => {
    const pattern = held.dataset(dataset)?.patterns[index];
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

/**
 * The reference sentence for one pattern, written out term by term, which a
 * group of that pattern alone must match. "of a" goes before a Class only,
 * which `isClass` reads from the test documents.
 */
const singleSentence = (
    model: Model,
    pattern: SchemaPattern,
    isClass: (id: string) => boolean,
): string => {
    const label = (id: string) => model.label(id);
    const series = (ids: readonly string[]) =>
        ids
            .map((id, index) =>
                index === 0
                    ? label(id)
                    : `${index === ids.length - 1 ? ' and ' : ', '}${label(id)}`,
            )
            .join('');
    let text = `The ${label(pattern.measured_property)}`;
    if (pattern.population_type !== null) {
        const article = isClass(pattern.population_type) ? 'a ' : '';
        text += ` of ${article}${label(pattern.population_type)}`;
    }
    if (pattern.measurement_qualifier !== null) {
        text += `, measured as ${label(pattern.measurement_qualifier)}`;
    }
    const between = pattern.observation_properties;
    if (between.length === 1) text += `, reported by ${series(between)}`;
    else if (between.length > 1) text += `, between ${series(between)}`;
    if (pattern.constraint_properties.length > 0) {
        text += `, split by ${series(pattern.constraint_properties)}`;
    }
    return `${text}.`;
};

test('a group of one pattern reads as the reference sentence for that pattern, for every fixture pattern', () => {
    const isClass = (id: string) =>
        everyModel.kind(id) === 'class' || (everyModel.term(id)?.types.includes('Class') ?? false);
    let checked = 0;
    for (const dataset of everyModel.datasets) {
        for (const pattern of dataset.patterns) {
            const [group, ...rest] = patternGroups([pattern]);
            assert.ok(group);
            assert.equal(rest.length, 0);
            assert.deepEqual(
                groupSentence(everyModel, group),
                patternSentence(everyModel, pattern),
            );
            assert.equal(
                read(groupSentence(everyModel, group)),
                singleSentence(everyModel, pattern, isClass),
            );
            checked += 1;
        }
    }
    assert.equal(checked, 19);
});

test('a population type that is not a Class reads without "a"', () => {
    assert.equal(
        read(patternSentence(everyModel, patternOf('undata/p/ECLAC', 0, everyModel))),
        'The Value of Older adults receiving insufficient pensions, split by Sex.',
    );
});

test("OECD DAC2A's six patterns form three groups whose pattern lines all differ", () => {
    const patterns = model.dataset('provenance/OECDDAC2A')?.patterns ?? [];
    const groups = patternGroups(patterns);
    assert.deepEqual(
        groups.map((group) => group.patterns.length).toSorted((a, b) => b - a),
        [4, 1, 1],
    );
    for (const group of groups) {
        const lines = group.patterns.map((pattern) => JSON.stringify(patternLine(group, pattern)));
        assert.equal(new Set(lines).size, lines.length, `repeated line in ${group.key}`);
    }
    const sentences = groups.map((group) => read(groupSentence(model, group)));
    assert.equal(new Set(sentences).size, sentences.length);
});

test("each group's StatVar total sums its patterns', and the groups sum the dataset's", () => {
    for (const dataset of everyModel.datasets) {
        const groups = patternGroups(dataset.patterns);
        const sum = (patterns: readonly SchemaPattern[]) =>
            patterns.reduce((total, pattern) => total + pattern.stat_var_count, 0);
        for (const group of groups) assert.equal(group.statVarCount, sum(group.patterns));
        assert.equal(
            groups.reduce((total, group) => total + group.statVarCount, 0),
            sum(dataset.patterns),
        );
        assert.deepEqual(
            groups.map((group) => group.statVarCount),
            groups.map((group) => group.statVarCount).toSorted((a, b) => b - a),
        );
    }
});

test('a slot names up to three terms joined with "or", and past that gives their count', () => {
    const [climate] = patternGroups(model.dataset('provenance/ONEClimateFinance')?.patterns ?? []);
    assert.ok(climate);
    assert.equal(
        read(groupSentence(model, climate)),
        'The amount or attributed amount of a financial flow, measured as Nominal, between ' +
            'financing provider and financing recipient, split by climate change policy ' +
            'objective, financial flow type and netting basis.',
    );

    const base = patternOf('provenance/OECDDAC1', 0);
    const many = ['amount', 'grantEquivalent', 'attributedAmount', 'principalAmount'].map(
        (measured, index): SchemaPattern => ({
            ...base,
            measured_property: measured,
            population_type: `Kind${index}`,
        }),
    );
    const [wide] = patternGroups(many);
    assert.ok(wide);
    assert.equal(
        read(groupSentence(model, wide)),
        'One of 4 measures of 4 kinds of thing, measured as Nominal, reported by financing ' +
            'provider, split by DAC 1 aid type, financial flow type and netting basis.',
    );
});
