/**
 * `search.ts` over the test documents: fields, ranking, datasets, the cap,
 * and base and UN System terms outside the model when their lists are given.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import { enterChoice, escapeAction, search, searchPlaceholder, stepActive } from '../search.ts';
import { outsideTermList, readSchema, readUsage, readTerms, readUnTerms } from '../wire.ts';
import { schemaBody, usageBody, termsBody } from './fixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
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

test('an open property value or name finds the nodes that carry it', () => {
    assert.deepEqual(
        search(model, 'DOD').hits.map((hit) => [hit.id, hit.match]),
        [['AmountOutstanding', 'exact']],
    );
    assert.equal(search(model, 'chf').hits[0]?.id, 'CurrencyCHF');
    assert.ok(ids('country/LIE').includes('CurrencyCHF'));
    assert.ok(ids('wbCode').includes('AmountOutstanding'));
    assert.ok(ids('wbCode').includes('wbCode'));
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

test('within a rank, DFO terms and datasets come before base terms', () => {
    // Dataset is a base class with a shorter label than either DFO property.
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

test('a model node declared by the UN System ranks after a DFO node, as base does', () => {
    const schema = readSchema(schemaBody());
    const declare = (ref: string, declaredBy: string) => {
        const node = schema.nodes.find((entry) => entry.ref === ref);
        assert.ok(node);
        node.declared_by = declaredBy;
    };
    // measuredValue is the shortest label, so label length alone would rank it first.
    declare('measuredValue', 'un_system');
    declare('measurementQualifier', 'dfo');
    const hits = search(buildModel(schema, readUsage(usageBody())), 'measure').hits.map((hit) => [
        hit.id,
        hit.declaredBy,
    ]);
    const un = hits.findIndex(([, by]) => by === 'un_system');
    const dfo = hits.findIndex(([, by]) => by === 'dfo');
    assert.ok(dfo >= 0 && un > dfo);
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
                declaredBy: 'base',
                inModel: true,
            },
        ],
    );
    const hits = search(model, 'amount', {
        outside: outsideTermList({ base: baseTerms }),
    }).hits.filter((hit) => hit.match === 'exact');
    assert.deepEqual(
        hits.map((hit) => [hit.id, hit.kind, hit.inModel]),
        [
            ['amount', 'property', true],
            ['Amount', 'class', false],
        ],
    );
});

test('a term with no declaring provenance outside the model is found', () => {
    const body = termsBody() as { terms: { ref: string; declared_by: string | null }[] };
    const term = body.terms.find((entry) => entry.ref === 'AdministrativeArea1');
    assert.ok(term);
    term.declared_by = null;
    const hits = search(model, 'AdministrativeArea1', {
        outside: outsideTermList({ base: readTerms(body) }),
    }).hits;
    assert.deepEqual(
        hits.filter((hit) => hit.match === 'exact').map((hit) => [hit.id, hit.inModel]),
        [['AdministrativeArea1', false]],
    );
});

test('a term outside the model carries the origin declaring it, and a DFO row is skipped', () => {
    const body = termsBody() as { terms: { ref: string; declared_by: string | null }[] };
    const term = body.terms.find((entry) => entry.ref === 'AdministrativeArea1');
    assert.ok(term);
    const exact = () =>
        search(model, 'AdministrativeArea1', {
            outside: outsideTermList({ base: readTerms(body) }),
        })
            .hits.filter((hit) => hit.match === 'exact')
            .map((hit) => [hit.id, hit.inModel, hit.declaredBy]);
    assert.deepEqual(exact(), [['AdministrativeArea1', false, 'base']]);
    term.declared_by = 'un_system';
    assert.deepEqual(exact(), [['AdministrativeArea1', false, 'un_system']]);
    term.declared_by = 'dfo';
    assert.deepEqual(exact(), []);
});

test('a base term the model holds is found once, as part of the model', () => {
    const hits = search(model, 'AdministrativeArea', {
        outside: outsideTermList({ base: baseTerms }),
    }).hits;
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

/** A UN System terms body, where every row is a Class under the UN provenance. */
const unBody = (rows: { ref: string; label: string; declared_by: string }[]) => ({
    generation: null,
    terms: rows.map((row) => ({ ...row, types: ['Class'], provenances: ['undata/p/UNData'] })),
});

test('UN System terms are found beside base terms, and the base row wins on a ref both lists hold', () => {
    const un = readUnTerms(
        unBody([
            { ref: 'undata/AGE', label: 'Age', declared_by: 'un_system' },
            // The UN System redeclares base classes. The list's AdministrativeArea1 row is UN's.
            { ref: 'AdministrativeArea1', label: 'AdministrativeArea1', declared_by: 'un_system' },
            // A row the UN body declares under another origin is ignored.
            { ref: 'undata/Stray', label: 'Age stray', declared_by: 'base' },
        ]),
    );
    const found = (query: string) =>
        search(model, query, { outside: outsideTermList({ base: baseTerms, un }), limit: 50 })
            .hits.filter((hit) => !hit.inModel)
            .map((hit) => [hit.id, hit.declaredBy]);

    assert.deepEqual(found('undata/'), [['undata/AGE', 'un_system']]);
    assert.deepEqual(
        found('AdministrativeArea1').filter(([id]) => id === 'AdministrativeArea1'),
        [['AdministrativeArea1', 'base']],
    );
    // With the base list missing, as after its load failed, UN hits stay.
    assert.deepEqual(
        search(model, 'AdministrativeArea1', { outside: outsideTermList({ un }) })
            .hits.filter((hit) => !hit.inModel)
            .map((hit) => [hit.id, hit.declaredBy]),
        [['AdministrativeArea1', 'un_system']],
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

test('Enter opens the active hit, else the first, and does nothing while the list is hidden or empty', () => {
    assert.equal(enterChoice(2, 5, true), 2);
    assert.equal(enterChoice(-1, 5, true), 0);
    assert.equal(enterChoice(7, 5, true), 0);
    assert.equal(enterChoice(2, 5, false), null);
    assert.equal(enterChoice(-1, 0, true), null);
});

test('Escape closes a shown list and clears the query once it is closed', () => {
    assert.equal(escapeAction(true), 'close');
    assert.equal(escapeAction(false), 'clear');
});

test('the placeholder says search is off after the model failed, apart from while it loads', () => {
    assert.notEqual(searchPlaceholder('failed'), searchPlaceholder('loading'));
    assert.notEqual(searchPlaceholder('failed'), searchPlaceholder('ready'));
});
