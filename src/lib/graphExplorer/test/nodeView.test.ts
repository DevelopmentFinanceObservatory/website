/**
 * `nodeView.ts`: the model for a centre the DFO document does not declare
 * joins the view's centre and neighbours to the DFO document's nodes, and
 * reads every usage document the full model holds.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import { centreModel, centreNodes } from '../nodeView.ts';
import { readSchema, readUsage, type SchemaNode, type SchemaNodeView } from '../wire.ts';
import { baseUsageBody, schemaBody, unUsageBody, usageBody } from './fixtures.ts';

const SERIES = 'undata/eclac/SERIES-INSUF_PENSION';
const SERIES_CLASS = 'undata/eclac/SERIES';

const node = (ref: string, fields: Partial<SchemaNode>): SchemaNode => ({
    ref,
    label: null,
    description: null,
    types: [],
    alternate_name: [],
    sub_class_of: [],
    sub_property_of: [],
    specialization_of: [],
    domain_includes: [],
    range_includes: [],
    classification_code: [],
    provenances: [],
    declared_by: null,
    instances: null,
    other_properties: {},
    ...fields,
});

const full = buildModel(
    readSchema(schemaBody()),
    readUsage(usageBody()),
    readUsage(baseUsageBody()),
    readUsage(unUsageBody()),
);

/** A UN series' view: its series class, and a stub of a class the DFO document holds. */
const seriesView: SchemaNodeView = {
    generation: 'un-generation',
    centre: node(SERIES, {
        label: 'Older adults receiving insufficient pensions',
        types: [SERIES_CLASS],
        provenances: ['undata/p/ECLAC'],
        declared_by: 'un_system',
    }),
    nodes: [
        node('FinancialFlow', { label: 'A stub', types: ['Class'] }),
        node(SERIES_CLASS, {
            label: 'ECLAC series',
            types: ['Class'],
            sub_class_of: ['Enumeration'],
            provenances: ['undata/p/ECLAC'],
            declared_by: 'un_system',
            instances: { refs: [SERIES], complete: false },
        }),
    ],
    capped: [],
};

test("a series' model holds the view's nodes beside the DFO document's, which win on a shared ref", () => {
    const model = centreModel(full, seriesView);
    assert.equal(model.kind(SERIES), 'value');
    assert.equal(model.node(SERIES)?.declared_by, 'un_system');
    assert.equal(model.kind(SERIES_CLASS), 'valueList');
    assert.equal(model.valueListOf(SERIES), SERIES_CLASS);
    assert.equal(model.membersComplete(SERIES_CLASS), false);
    assert.deepEqual(model.node('FinancialFlow'), full.node('FinancialFlow'));
    assert.equal(model.nodes.length, full.nodes.length + 2);
    assert.equal(model.generation, full.generation);
    // Held or outside stays a fact of the full model.
    assert.equal(full.node(SERIES), undefined);
});

test("a series' model reads the full model's usage, so the series has its measured and split properties", () => {
    const model = centreModel(full, seriesView);
    assert.equal(model.isPopulationType(SERIES), true);
    assert.deepEqual(model.usage(SERIES).total, 4);
    const { groups } = model.propertiesOf(SERIES);
    assert.deepEqual(
        groups.measured.map((entry) => entry.id),
        ['value'],
    );
    assert.deepEqual(
        groups.split.map((entry) => entry.id),
        ['sex'],
    );
    assert.equal(model.label('sex'), 'Sex');
});

test("the view's centre replaces a held node of the same ref", () => {
    const held = full.node('FinancialFlow');
    assert.ok(held);
    const centre = {
        ...held,
        sub_class_of: [...held.sub_class_of, 'Thing'],
        description: 'read live',
    };
    const nodes = centreNodes(full, { generation: null, centre, nodes: [held], capped: [] });
    assert.equal(nodes.length, full.nodes.length);
    assert.equal(nodes.filter((entry) => entry.ref === 'FinancialFlow').length, 1);
    assert.equal(
        nodes.find((entry) => entry.ref === 'FinancialFlow'),
        centre,
    );
});

test('each pair of full model and view builds once', () => {
    assert.equal(centreModel(full, seriesView), centreModel(full, seriesView));
    assert.notEqual(centreModel(full, seriesView), centreModel(full, { ...seriesView }));
});
