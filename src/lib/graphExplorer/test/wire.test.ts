/**
 * `wire.ts`: each guard accepts the served document and refuses one whose
 * shape has moved, naming the member.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { asRecord } from '../../asRecord.ts';
import { readCheckResponse, readSchema, readUsage, readTerms, WireShapeError } from '../wire.ts';
import { schemaBody, usageBody, termsBody } from './fixtures.ts';

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
    assert.equal(readSchema(schemaBody()).nodes.length, 234);
    assert.equal(readTerms(termsBody()).terms.length, 282);
    assert.equal(readUsage(usageBody()).provenances.length, 4);
});

test('the schema guard refuses a node with a member removed or retyped', () => {
    const missing = schemaBody();
    delete at(missing, ['nodes', 0]).declared_by;
    refuses(readSchema, missing, 'schema.nodes[0].declared_by');

    const retyped = schemaBody();
    at(retyped, ['nodes', 0]).sub_class_of = 'Thing';
    refuses(readSchema, retyped, 'schema.nodes[0].sub_class_of');

    // Every origin id reads, and one this page does not know passes for the screens to word.
    for (const origin of ['dfo', 'base', 'un_system', 'some_new_origin']) {
        const declared = schemaBody();
        at(declared, ['nodes', 0]).declared_by = origin;
        assert.equal(readSchema(declared).nodes[0]?.declared_by, origin);
    }
    const numberDeclarer = schemaBody();
    at(numberDeclarer, ['nodes', 0]).declared_by = 7;
    refuses(readSchema, numberDeclarer, 'schema.nodes[0].declared_by');

    const listIndex = readSchema(schemaBody()).nodes.findIndex((node) => node.enumeration !== null);
    const unmarked = schemaBody();
    delete at(unmarked, ['nodes', listIndex, 'enumeration']).complete;
    refuses(readSchema, unmarked, `schema.nodes[${listIndex}].enumeration.complete`);

    const undeclared = schemaBody();
    at(undeclared, ['nodes', 0]).declared_by = null;
    assert.equal(readSchema(undeclared).nodes[0]?.declared_by, null);

    const noGeneration = schemaBody();
    delete at(noGeneration, []).generation;
    refuses(readSchema, noGeneration, 'schema.generation');
});

test('the schema guard reads open properties as ref or literal values', () => {
    const nodes = readSchema(schemaBody()).nodes;
    assert.deepEqual(nodes.find((node) => node.ref === 'CurrencyCHF')?.other_properties, {
        currencyStatus: [{ ref: 'CurrencyStatusCurrent' }],
        dacCode: [{ value: '11' }, { value: '70' }],
        iso4217AlphaCode: [{ value: 'CHF' }],
        iso4217NumericCode: [{ value: '756' }],
        nationalCurrencyOf: [{ ref: 'country/CHE' }, { ref: 'country/LIE' }],
    });
    const index = nodes.findIndex((node) => node.ref === 'CurrencyCHF');
    const path = `schema.nodes[${index}].other_properties`;

    const missing = schemaBody();
    delete at(missing, ['nodes', index]).other_properties;
    refuses(readSchema, missing, path);

    for (const [entry, member] of [
        [{ ref: 'X', value: 'Y' }, `${path}.dacCode[0]:`],
        [{}, `${path}.dacCode[0]:`],
        [{ code: 'X' }, `${path}.dacCode[0]:`],
        ['11', `${path}.dacCode[0]:`],
        [{ value: 11 }, `${path}.dacCode[0].value`],
        [{ ref: null }, `${path}.dacCode[0].ref`],
    ] as const) {
        const body = schemaBody();
        at(body, ['nodes', index, 'other_properties']).dacCode = [entry];
        refuses(readSchema, body, member);
    }

    const notList = schemaBody();
    at(notList, ['nodes', index, 'other_properties']).dacCode = { value: '11' };
    refuses(readSchema, notList, `${path}.dacCode`);

    const notMap = schemaBody();
    at(notMap, ['nodes', index]).other_properties = [];
    refuses(readSchema, notMap, path);
});

test('the terms guard refuses a term with a member removed', () => {
    const body = termsBody();
    delete at(body, ['terms', 0]).types;
    refuses(readTerms, body, 'terms.terms[0].types');
});

test('the usage guard checks patterns, constraint values and facets', () => {
    const pattern = usageBody();
    delete at(pattern, ['provenances', 0, 'patterns', 0]).observation_properties;
    refuses(readUsage, pattern, 'usage.provenances[0].patterns[0].observation_properties');

    const count = usageBody();
    at(count, ['provenances', 0, 'constraint_values', 0, 'values', 0]).stat_var_count = '10';
    refuses(readUsage, count, 'usage.provenances[0].constraint_values[0].values[0].stat_var_count');

    const facets = usageBody();
    delete at(facets, ['provenances', 0, 'facets']).currencies;
    refuses(readUsage, facets, 'usage.provenances[0].facets.currencies');
});

test('each guard checks every element of every list, not only the first', () => {
    const schema = schemaBody();
    at(schema, ['nodes', 200]).alternate_name = null;
    refuses(readSchema, schema, 'schema.nodes[200].alternate_name');

    const name = schemaBody();
    at(name, ['nodes', 100]).sub_class_of = ['Thing', 7];
    refuses(readSchema, name, 'schema.nodes[100].sub_class_of[1]');

    const terms = termsBody();
    delete at(terms, ['terms', 281]).declared_by;
    refuses(readTerms, terms, 'terms.terms[281].declared_by');

    const undeclaredTerm = termsBody();
    at(undeclaredTerm, ['terms', 281]).declared_by = null;
    assert.equal(readTerms(undeclaredTerm).terms[281]?.declared_by, null);

    const pattern = usageBody();
    at(pattern, ['provenances', 3, 'patterns', 0]).examples = null;
    refuses(readUsage, pattern, 'usage.provenances[3].patterns[0].examples');
});

for (const [document, read, body, list] of [
    ['schema', readSchema, schemaBody, 'nodes'],
    ['terms', readTerms, termsBody, 'terms'],
    ['usage', readUsage, usageBody, 'provenances'],
] as const) {
    test(`the ${document} guard refuses a ref listed twice, naming it`, () => {
        const repeated = body();
        const entries = at(repeated, [])[list];
        assert.ok(Array.isArray(entries));
        const ref = at(repeated, [list, 1]).ref;
        entries.push({ ...at(repeated, [list, 1]) });
        assert.throws(
            () => read(repeated),
            (error: unknown) =>
                error instanceof WireShapeError &&
                error.message.startsWith(`${document}.${list}[${entries.length - 1}].ref`) &&
                error.message.includes(String(ref)),
        );
    });
}

test('the check guard reads every finding: unknown enum values pass, a later finding out of shape fails', () => {
    const finding = {
        row: 1,
        field: 'constraint_properties',
        property: 'crsPurpose',
        subject: 'value',
        value: 'CRSPurposeCode99999',
        served: null,
        code: 'node_not_held',
        severity: 'error',
    };
    const answer = { generation: 'g1', rows_checked: 2, findings: [finding] };
    assert.equal(readCheckResponse(answer).findings[0]?.property, 'crsPurpose');

    const added = { ...answer, findings: [finding, { ...finding, code: 'origin_not_served' }] };
    assert.equal(readCheckResponse(added).findings[1]?.code, 'origin_not_served');
    const notANode = { ...answer, findings: [finding, { ...finding, code: 'not_a_node' }] };
    assert.equal(readCheckResponse(notANode).findings[1]?.code, 'not_a_node');
    const unknown = {
        ...answer,
        findings: [
            finding,
            {
                ...finding,
                code: 'some_new_code',
                field: 'some_new_field',
                subject: 'cell',
                severity: 'info',
            },
        ],
    };
    assert.deepEqual(readCheckResponse(unknown).findings[1], unknown.findings[1]);

    const later = (change: Record<string, unknown>) => ({
        ...answer,
        findings: [finding, { ...finding, ...change }],
    });
    for (const member of ['row', 'property', 'subject', 'served']) {
        const missing: Record<string, unknown> = { ...finding };
        delete missing[member];
        refuses(
            readCheckResponse,
            { ...answer, findings: [finding, missing] },
            `check.findings[1].${member}`,
        );
    }
    refuses(readCheckResponse, later({ severity: 2 }), 'check.findings[1].severity');
    refuses(readCheckResponse, later({ value: ['a', 7] }), 'check.findings[1].value[1]');
    refuses(readCheckResponse, later({ field: null }), 'check.findings[1].field');
    refuses(readCheckResponse, later({ subject: null }), 'check.findings[1].subject');
    refuses(readCheckResponse, later({ code: 7 }), 'check.findings[1].code');
    refuses(readCheckResponse, later({ row: 1.5 }), 'check.findings[1].row');
    refuses(readCheckResponse, later({ row: -1 }), 'check.findings[1].row');
    refuses(readCheckResponse, { generation: 'g1', findings: [] }, 'check.rows_checked');
    refuses(
        readCheckResponse,
        { generation: 'g1', rows_checked: '2', findings: [] },
        'check.rows_checked',
    );
});

test('a null generation is accepted on every document and a non-string one is refused', () => {
    const schema = schemaBody();
    at(schema, []).generation = null;
    assert.equal(readSchema(schema).generation, null);

    const terms = termsBody();
    at(terms, []).generation = null;
    assert.equal(readTerms(terms).generation, null);

    assert.equal(
        readCheckResponse({ generation: null, rows_checked: 1, findings: [] }).generation,
        null,
    );

    const retyped = schemaBody();
    at(retyped, []).generation = 7;
    refuses(readSchema, retyped, 'schema.generation');
    refuses(readTerms, { generation: 7, terms: [] }, 'terms.generation');
    refuses(
        readCheckResponse,
        { generation: 7, rows_checked: 1, findings: [] },
        'check.generation',
    );
});
