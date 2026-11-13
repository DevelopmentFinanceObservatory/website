/**
 * `wire.ts`: each guard accepts the served document and refuses one whose
 * shape has moved, naming the member.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { asRecord } from '../../asRecord.ts';
import {
    readCheckResponse,
    readOntology,
    readProvenances,
    readTerms,
    WireShapeError,
} from '../wire.ts';
import { ontologyBody, provenancesBody, termsBody } from './fixtures.ts';

/** The record at `path` in a parsed document; fails the test when there is none. */
const at = (body: unknown, path: (string | number)[]): Record<string, unknown> => {
    let value = body;
    for (const key of path) {
        value = Array.isArray(value) ? value[Number(key)] : asRecord(value)?.[key];
    }
    const record = asRecord(value);
    assert.ok(record, `no object at ${path.join('.')}`);
    return record;
};

const refuses = (read: (body: unknown) => unknown, body: unknown, member: string) =>
    assert.throws(
        () => read(body),
        (error: unknown) => error instanceof WireShapeError && error.message.startsWith(member),
    );

test('each guard accepts the served document', () => {
    assert.equal(readOntology(ontologyBody()).nodes.length, 230);
    assert.equal(readTerms(termsBody()).terms.length, 282);
    assert.equal(readProvenances(provenancesBody()).provenances.length, 4);
});

test('the ontology guard refuses a node with a member removed or retyped', () => {
    const missing = ontologyBody();
    delete at(missing, ['nodes', 0]).declared_by;
    refuses(readOntology, missing, 'ontology.nodes[0].declared_by');

    const retyped = ontologyBody();
    at(retyped, ['nodes', 0]).sub_class_of = 'Thing';
    refuses(readOntology, retyped, 'ontology.nodes[0].sub_class_of');

    const unknownDeclarer = ontologyBody();
    at(unknownDeclarer, ['nodes', 0]).declared_by = 'shared';
    refuses(readOntology, unknownDeclarer, 'ontology.nodes[0].declared_by');

    const undeclared = ontologyBody();
    at(undeclared, ['nodes', 0]).declared_by = null;
    assert.equal(readOntology(undeclared).nodes[0]?.declared_by, null);

    const noGeneration = ontologyBody();
    delete at(noGeneration, []).generation;
    refuses(readOntology, noGeneration, 'ontology.generation');
});

test('the terms guard refuses a term with a member removed', () => {
    const body = termsBody();
    delete at(body, ['terms', 0]).types;
    refuses(readTerms, body, 'terms.terms[0].types');
});

test('the provenances guard checks the first pattern, constraint value and facets', () => {
    const pattern = provenancesBody();
    delete at(pattern, ['provenances', 0, 'patterns', 0]).observation_properties;
    refuses(
        readProvenances,
        pattern,
        'provenances.provenances[0].patterns[0].observation_properties',
    );

    const count = provenancesBody();
    at(count, ['provenances', 0, 'constraint_values', 0, 'values', 0]).stat_var_count = '10';
    refuses(
        readProvenances,
        count,
        'provenances.provenances[0].constraint_values[0].values[0].stat_var_count',
    );

    const facets = provenancesBody();
    delete at(facets, ['provenances', 0, 'facets']).currencies;
    refuses(readProvenances, facets, 'provenances.provenances[0].facets.currencies');
});

test('the check guard accepts a served answer and refuses an unknown finding code', () => {
    const finding = {
        ref: 'row 2',
        field: 'constraint_properties.crsPurpose',
        value: 'CRSPurposeCode99999',
        code: 'node_not_held',
        severity: 'error',
    };
    const answer = { generation: 'g1', row_count: 2, findings: [finding] };
    assert.equal(readCheckResponse(answer).findings[0]?.code, 'node_not_held');

    refuses(
        readCheckResponse,
        { ...answer, findings: [{ ...finding, code: 'not_held' }] },
        'check.findings[0].code',
    );
    refuses(readCheckResponse, { generation: 'g1', findings: [] }, 'check.row_count');
});

test('a null generation is accepted on every document and a non-string one is refused', () => {
    const ontology = ontologyBody();
    at(ontology, []).generation = null;
    assert.equal(readOntology(ontology).generation, null);

    const terms = termsBody();
    at(terms, []).generation = null;
    assert.equal(readTerms(terms).generation, null);

    assert.equal(
        readCheckResponse({ generation: null, row_count: 0, findings: [] }).generation,
        null,
    );

    const retyped = ontologyBody();
    at(retyped, []).generation = 7;
    refuses(readOntology, retyped, 'ontology.generation');
    refuses(readTerms, { generation: 7, terms: [] }, 'terms.generation');
    refuses(readCheckResponse, { generation: 7, row_count: 0, findings: [] }, 'check.generation');
});
