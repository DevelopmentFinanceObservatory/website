/**
 * `search.ts` over the test documents: fields, ranking, datasets, the cap,
 * and base terms outside the model when the terms list is given.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import { search, stepActive } from '../search.ts';
import { readOntology, readProvenances, readTerms } from '../wire.ts';
import { ontologyBody, provenancesBody, termsBody } from './fixtures.ts';

const model = buildModel(readOntology(ontologyBody()), readProvenances(provenancesBody()));
const baseTerms = readTerms(termsBody());

const ids = (query: string, limit = 50) =>
    search(model, query, { limit }).hits.map((hit) => hit.id);

test('a classification code or alternate name matches exactly, ignoring case', () => {
    assert.deepEqual(
        search(model, '1015').hits.map((hit) => [hit.id, hit.match]),
        [['DAC1AidType1015', 'exact']],
    );
    const oda = search(model, 'oda').hits[0];
    assert.equal(oda?.id, 'DAC1AidType1010');
    assert.equal(oda?.match, 'exact');
});

test('exact beats prefix beats substring', () => {
    const hits = search(model, 'Source', { limit: 50 }).hits;
    assert.deepEqual(
        hits.map((hit) => [hit.id, hit.match]),
        [
            ['Source', 'exact'],
            ['sourceIndicatorCode', 'prefix'],
            ['FinancingResourceEnum', 'substring'],
            ['financingResource', 'substring'],
        ],
    );
});

test('within a rank, instance terms and datasets come before base terms', () => {
    // Dataset is a base class with a shorter label than either instance property.
    assert.deepEqual(ids('data').slice(0, 4), [
        'dataTransformationChangelog',
        'dataTransformationDescription',
        'Dataset',
        'DataType',
    ]);
    assert.deepEqual(ids('measure').slice(0, 3), [
        'MeasurementEnum',
        'measuredValue',
        'measurementQualifier',
    ]);
});

test('datasets are found by label and dcid', () => {
    const hits = search(model, 'oecd dac2', { limit: 50 }).hits;
    assert.deepEqual(
        hits.map((hit) => [hit.id, hit.kind, hit.match]),
        [
            ['provenance/OECDDAC2A', 'dataset', 'prefix'],
            ['provenance/OECDDAC2B', 'dataset', 'prefix'],
        ],
    );
});

test('hits are capped with the total kept', () => {
    const result = search(model, 'oda', { limit: 3 });
    assert.equal(result.hits.length, 3);
    assert.equal(result.total, 21);
    assert.deepEqual(search(model, '   '), { hits: [], total: 0 });
});

test('with the terms list, base terms outside the model follow those inside', () => {
    assert.deepEqual(
        search(model, 'amount').hits.filter((hit) => hit.match === 'exact'),
        [
            {
                id: 'amount',
                kind: 'property',
                label: 'amount',
                match: 'exact',
                base: true,
                inModel: true,
            },
        ],
    );
    const hits = search(model, 'amount', { baseTerms }).hits.filter((hit) => hit.match === 'exact');
    assert.deepEqual(
        hits.map((hit) => [hit.id, hit.kind, hit.inModel]),
        [
            ['amount', 'property', true],
            ['Amount', 'class', false],
        ],
    );
});

test('a base term the model holds is found once, as part of the model', () => {
    const hits = search(model, 'AdministrativeArea', { baseTerms }).hits;
    assert.deepEqual(
        hits.filter((hit) => hit.match === 'exact').map((hit) => [hit.id, hit.inModel]),
        [['AdministrativeArea', true]],
    );
    // Its narrower levels are base classes outside the model.
    assert.deepEqual(
        hits.slice(1, 3).map((hit) => [hit.id, hit.match, hit.inModel]),
        [
            ['AdministrativeArea1', 'prefix', false],
            ['AdministrativeArea2', 'prefix', false],
        ],
    );
});

test('the arrow keys wrap over the hits; with none active, up lands on the last', () => {
    assert.equal(stepActive(-1, -1, 5), 4);
    assert.equal(stepActive(-1, 1, 5), 0);
    assert.equal(stepActive(0, -1, 5), 4);
    assert.equal(stepActive(4, 1, 5), 0);
    assert.equal(stepActive(2, 1, 5), 3);
    assert.equal(stepActive(-1, -1, 0), -1);
});
