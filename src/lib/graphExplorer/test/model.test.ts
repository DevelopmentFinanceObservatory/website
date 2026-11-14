/**
 * `model.ts` over the test documents: kinds, relations, member trees, usage,
 * roles, a class's properties, a dataset as a node, the scoped list and the lens.
 * Every expected value was read from the fixture documents directly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildModel,
    datasetName,
    declarerWords,
    filterScopedList,
    GROUPS,
    cellWidth,
    kindOfTerm,
    memberFields,
    openColumns,
    plainName,
    searchMembers,
    type MemberTree,
} from '../model.ts';
import { readSchema, readUsage, type SchemaNode } from '../wire.ts';
import { schemaBody, usageBody } from './fixtures.ts';
import { withListedParties } from './sheetFixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));

const DAC1 = 'provenance/OECDDAC1';
const DAC2A = 'provenance/OECDDAC2A';
const DAC2B = 'provenance/OECDDAC2B';
const CLIMATE = 'provenance/ONEClimateFinance';

test('a node reads as a class, value list, property or value, with its label and declarer', () => {
    assert.equal(model.kind('FinancialFlow'), 'class');
    assert.equal(model.kind('FinancialFlowTypeEnum'), 'valueList');
    assert.equal(model.kind('EconomicMetricEnum'), 'valueList');
    assert.equal(model.kind('financialFlowType'), 'property');
    assert.equal(model.kind('Buyback'), 'value');
    assert.equal(model.kind('Count_Person'), 'value');
    assert.equal(model.kind(DAC1), undefined);

    assert.equal(
        model.label('DAC1AidType1010'),
        'official development assistance (DAC 1 aid type)',
    );
    assert.equal(model.label(DAC2B), 'OECD DAC2b');
    assert.equal(model.label('NotANode'), 'NotANode');

    assert.equal(model.isBase('amount'), true);
    assert.equal(model.isBase('Nominal'), true);
    assert.equal(model.isBase('financialFlowType'), false);
});

test('a class outside Enumeration that lists its instances stays a class and offers its list', () => {
    assert.equal(model.kind('CurrencyDenomination'), 'class');
    assert.equal(model.kind('CurrencyUnit'), 'class');
    assert.equal(model.hasValueList('CurrencyDenomination'), true);
    assert.equal(model.hasValueList('CurrencyUnit'), true);
    assert.equal(model.hasValueList('NonSpecificCurrency'), false);
    assert.deepEqual(model.valueListOfProperty('currencyOfDenomination'), {
        lists: ['CurrencyDenomination'],
        members: ['CurrencyEUR', 'CurrencyCHF'],
        complete: true,
    });
    // Members sort by label when none has a code: Euro, then Swiss franc.
    assert.deepEqual(model.members('CurrencyDenomination'), ['CurrencyEUR', 'CurrencyCHF']);
    assert.equal(model.membersComplete('CurrencyDenomination'), true);
    assert.equal(model.valueListOf('CurrencyCHF'), 'CurrencyUnit');
    assert.deepEqual(memberFields(model, model.members('CurrencyDenomination')), [
        'currencyStatus',
        'dacCode',
        'iso4217AlphaCode',
        'iso4217NumericCode',
        'nationalCurrencyOf',
    ]);
});

test("a property's value list joins its range classes' lists, partial while a range class lists none", () => {
    const listed = withListedParties();
    // G20 sits in both lists and comes once; coded members sort first, then by label.
    const union = {
        lists: ['DACUnspecifiedParty', 'Grouping'],
        members: ['DACMembers', 'G20', 'UnspecifiedDonor'],
    };
    // Country, IDSUnidentifiedCreditor and Organization list no instances.
    assert.deepEqual(listed.valueListOfProperty('financingProvider'), {
        ...union,
        complete: false,
    });
    const scoped = listed.scopedList({ kind: 'dfo' }, { kind: 'none' });
    const row = GROUPS.flatMap((group) => scoped.groups[group]).find(
        (each) => each.id === 'financingProvider',
    );
    assert.deepEqual(row?.valueList, { ...union, complete: false });
});

test('a property whose range classes all list their instances is complete only when every list is', () => {
    for (const complete of [true, false]) {
        const body = schemaBody() as { nodes: Record<string, unknown>[] };
        const provider = body.nodes.find((node) => node.ref === 'financingProvider');
        assert.ok(provider);
        provider.range_includes = ['CurrencyDenomination', 'NettingBasisEnum'];
        const netting = body.nodes.find((node) => node.ref === 'NettingBasisEnum');
        assert.ok(netting);
        netting.instances = { ...(netting.instances as object), complete };
        const ranged = buildModel(readSchema(body), readUsage(usageBody()));
        assert.equal(ranged.valueListOfProperty('financingProvider')?.complete, complete);
    }
});

test('a node the graph declares no type for is not base', () => {
    const schema = readSchema(schemaBody());
    const amount = schema.nodes.find((node) => node.ref === 'amount');
    assert.ok(amount);
    amount.declared_by = null;
    const undeclared = buildModel(schema, readUsage(usageBody()));
    assert.equal(undeclared.isBase('amount'), false);
});

test('only a DFO-declared property is in the DFO scope, and each origin has its words', () => {
    const schema = readSchema(schemaBody());
    const flowType = schema.nodes.find((node) => node.ref === 'financialFlowType');
    assert.ok(flowType);
    assert.ok(model.dfoProperties().includes('financialFlowType'));
    flowType.declared_by = 'un_system';
    const elsewhere = buildModel(schema, readUsage(usageBody()));
    assert.ok(!elsewhere.dfoProperties().includes('financialFlowType'));
    assert.equal(elsewhere.isBase('financialFlowType'), false);

    assert.deepEqual(['dfo', 'base', 'un_system', 'some_new_origin', null].map(declarerWords), [
        'DFO',
        'base Data Commons',
        'UN System Data Commons',
        'another origin',
        null,
    ]);
});

test('a dataset with no label is named by the last path segment of its dcid', () => {
    assert.equal(datasetName({ ref: DAC2B, label: 'OECD DAC2b' }), 'OECD DAC2b');
    assert.equal(
        datasetName({ ref: 'provenance/WorldBankInternationalDebtStatistics', label: null }),
        'WorldBankInternationalDebtStatistics',
    );
    assert.equal(datasetName({ ref: 'Unprefixed', label: null }), 'Unprefixed');

    const provenances = readUsage(usageBody());
    const dac1 = provenances.provenances.find((dataset) => dataset.ref === DAC1);
    assert.ok(dac1);
    dac1.label = null;
    const unlabelled = buildModel(readSchema(schemaBody()), provenances);
    assert.equal(unlabelled.label(DAC1), 'OECDDAC1');
    assert.equal(unlabelled.datasetView(DAC1)?.label, 'OECDDAC1');
});

test('broader, narrower and ancestors follow subClassOf and specializationOf', () => {
    assert.deepEqual(model.broader('FinancialFlow'), ['FinancingEvent']);
    assert.deepEqual(model.ancestors('FinancialFlow'), ['FinancingEvent', 'Thing']);
    assert.deepEqual(model.ancestors('DAC1AidType1100'), [
        'DAC1AidType1015',
        'DAC1AidType1010',
        'DAC1AidType5',
    ]);
    assert.ok(model.narrower('FinancingEvent').includes('FinancialFlow'));
    assert.deepEqual(model.narrower('WriteDown'), ['Buyback']);
});

test('a value list has its members and a member tree, roots first', () => {
    assert.equal(model.members('FinancialFlowTypeEnum').length, 14);
    assert.equal(model.membersComplete('FinancialFlowTypeEnum'), true);
    // The document cut DAC1AidTypeEnum short, and lists the base EconomicMetricEnum in part.
    assert.equal(model.membersComplete('DAC1AidTypeEnum'), false);
    assert.equal(model.membersComplete('EconomicMetricEnum'), false);
    assert.equal(model.valueListOf('Buyback'), 'FinancialFlowTypeEnum');
    assert.deepEqual(model.valueListOfProperty('dac1AidType')?.lists, ['DAC1AidTypeEnum']);

    const tree = model.memberTree('DAC1AidTypeEnum');
    assert.deepEqual(
        tree.map((root) => root.id),
        [
            'DAC1AidType5',
            'DAC1AidType1041',
            'DAC1AidType1042',
            'DAC1AidType1044',
            'DAC1AidType1045',
        ],
    );
    const oda = tree[0]?.children.find((child) => child.id === 'DAC1AidType1010');
    assert.deepEqual(
        oda?.children.map((child) => child.id),
        ['DAC1AidType1015'],
    );
    assert.deepEqual(
        oda?.children[0]?.children.map((child) => child.id),
        ['DAC1AidType1100', 'DAC1AidType11016', 'DAC1AidType11017', 'DAC1AidType11018'],
    );
});

/** A value of NettingBasisEnum that specialises `parents`. */
const nettingValue = (dcid: string, parents: string[]): SchemaNode => ({
    ref: dcid,
    label: null,
    description: null,
    types: ['NettingBasisEnum'],
    alternate_name: [],
    sub_class_of: [],
    sub_property_of: [],
    specialization_of: parents,
    domain_includes: [],
    range_includes: [],
    classification_code: [],
    provenances: ['provenance/DFOOntology'],
    declared_by: 'dfo',
    instances: null,
    other_properties: {},
});

const treeIds = (trees: readonly MemberTree[]): string[] =>
    trees.flatMap((tree) => [tree.id, ...treeIds(tree.children)]);

test('a member tree holds every member once, with a cycle and a self-loop as roots', () => {
    const schema = readSchema(schemaBody());
    schema.nodes.push(
        nettingValue('CycleA', ['CycleB']),
        nettingValue('CycleB', ['CycleA']),
        nettingValue('UnderA', ['CycleA']),
        nettingValue('Itself', ['Itself']),
    );
    const cyclic = buildModel(schema, readUsage(usageBody()));
    const tree = cyclic.memberTree('NettingBasisEnum');

    assert.deepEqual(treeIds(tree).toSorted(), [...cyclic.members('NettingBasisEnum')].toSorted());
    assert.equal(treeIds(tree).length, 6);
    const roots = tree.map((root) => root.id);
    for (const id of ['CycleA', 'CycleB', 'Itself']) assert.ok(roots.includes(id), id);
    assert.deepEqual(
        tree.find((root) => root.id === 'CycleA')?.children.map((child) => child.id),
        ['UnderA'],
    );
});

test('no list repeats an id', () => {
    const schema = readSchema(schemaBody());
    const netting = schema.nodes.find((node) => node.ref === 'nettingBasis');
    assert.ok(netting);
    netting.range_includes = ['NettingBasisEnum', 'NettingBasisEnum'];
    const repeated = buildModel(schema, readUsage(usageBody()));

    assert.deepEqual(repeated.node('nettingBasis')?.range_includes, ['NettingBasisEnum']);
    const withRange = repeated.propertiesWithRange('NettingBasisEnum');
    assert.equal(new Set(withRange).size, withRange.length);
});

test('usage counts StatVars per dataset from patterns and constraint values', () => {
    assert.deepEqual(model.usage('financialFlowType'), {
        byDataset: [
            { dataset: DAC1, count: 425 },
            { dataset: DAC2A, count: 25 },
            { dataset: DAC2B, count: 14 },
            { dataset: CLIMATE, count: 10 },
        ],
        total: 474,
    });
    // DAC1 sets it on its FinancialFlow and FinancialObligation patterns; the climate dataset never.
    assert.equal(model.usageIn('dacTypeOfFinance', DAC1), 259);
    assert.equal(model.usageIn('dacTypeOfFinance', CLIMATE), 0);
    // A value is counted from the dataset's constraint values.
    assert.deepEqual(model.usage('DAC2bAidType201').byDataset, [{ dataset: DAC2B, count: 1 }]);
    assert.deepEqual(model.usage('NotANode'), { byDataset: [], total: 0 });
});

test('a value in both a pattern field and the constraint values is counted once', () => {
    // DAC2B's second pattern (4 StatVars) gains DAC2bAidType972, which 2 StatVars take as a value.
    const body = readUsage(usageBody());
    const dac2b = body.provenances.find((provenance) => provenance.ref === DAC2B);
    const pattern = dac2b?.patterns[1];
    assert.equal(pattern?.stat_var_count, 4);
    if (pattern) pattern.measurement_denominator = 'DAC2bAidType972';

    const altered = buildModel(readSchema(schemaBody()), body);
    assert.equal(altered.usageIn('DAC2bAidType972', DAC2B), 4);
});

test('a role comes from the patterns, per dataset or over all of them', () => {
    assert.deepEqual(model.roles('amount'), ['measured']);
    assert.deepEqual(model.roles('financingRecipient'), ['between']);
    assert.deepEqual(model.roles('dacTypeOfFinance'), ['split']);
    assert.deepEqual(model.roles('dacTypeOfFinance', DAC2B), ['split']);
    assert.deepEqual(model.roles('dacTypeOfFinance', CLIMATE), []);
    assert.deepEqual(model.roles('financingRecipient', DAC1), []);
    assert.deepEqual(model.roles('crsPurpose'), []);
});

test('"used with" lists the population types of the patterns that use a property', () => {
    assert.deepEqual(model.usedWith('financialFlowType'), [
        { classId: 'FinancialFlow', count: 474 },
    ]);
    assert.deepEqual(model.usedWith('climatePolicyObjective'), [
        { classId: 'FinancialFlow', count: 10 },
        { classId: 'FinancialObligation', count: 9 },
    ]);
    assert.deepEqual(model.usedWith('crsPurpose'), []);
});

test('the population types count the datasets and StatVars that use each', () => {
    assert.deepEqual(model.populationTypes(), [
        { classId: 'FinancialFlow', datasets: 4, statVars: 474 },
        { classId: 'FinancialObligation', datasets: 2, statVars: 138 },
    ]);
});

test("a class's properties join its domain, its ancestors' domains and use", () => {
    const { all, groups } = model.propertiesOf('FinancialFlow');
    const entry = (id: string) => all.find((property) => property.id === id);

    assert.deepEqual(entry('financialFlowType'), {
        id: 'financialFlowType',
        inheritedFrom: null,
        declared: true,
        roles: ['split'],
    });
    assert.equal(entry('dac1AidType')?.inheritedFrom, 'FinancingEvent');
    assert.equal(entry('wbCode')?.inheritedFrom, 'Thing');
    // Used as the measured property on FinancialFlow but named by no domain.
    assert.deepEqual(entry('amount'), {
        id: 'amount',
        inheritedFrom: null,
        declared: false,
        roles: ['measured'],
    });
    assert.equal(all.length, 34);

    assert.deepEqual(
        groups.measured.map((property) => property.id),
        ['amount', 'grantEquivalent', 'attributedAmount'],
    );
    assert.deepEqual(
        groups.between.map((property) => property.id),
        ['financingProvider', 'financingRecipient'],
    );
    assert.equal(groups.split.length, 7);
    assert.ok(groups.unused.some((property) => property.id === 'crsPurpose'));
    assert.equal(
        GROUPS.reduce((sum, group) => sum + groups[group].length, 0),
        all.length,
    );
});

test('byUse lists each id once, most used first', () => {
    assert.deepEqual(
        model.byUse([
            'nettingBasis',
            'crsPurpose',
            'dacTypeOfFinance',
            'financialFlowType',
            'nettingBasis',
        ]),
        ['financialFlowType', 'nettingBasis', 'dacTypeOfFinance', 'crsPurpose'],
    );
    // Ties on use fall back to the label.
    assert.deepEqual(model.byUse(['crsTypeOfFlow', 'crsPurpose']), ['crsPurpose', 'crsTypeOfFlow']);
});

test('a dataset reads as a node with its patterns and the values it uses of each list', () => {
    const view = model.datasetView(DAC2B);
    assert.ok(view);
    assert.equal(view.label, 'OECD DAC2b');
    assert.equal(view.statVarCount, 14);
    assert.deepEqual(
        view.patterns.map((pattern) => pattern.stat_var_count),
        [10, 4],
    );
    assert.deepEqual(view.populationTypes, ['FinancialFlow']);
    assert.deepEqual(view.measured, ['amount']);
    assert.deepEqual(view.between, ['financingProvider', 'financingRecipient']);
    assert.deepEqual(view.splits, [
        { property: 'dac2bAidType', values: { used: 12, of: 12, complete: true } },
        { property: 'financialFlowType', values: { used: 1, of: 14, complete: true } },
        { property: 'nettingBasis', values: { used: 2, of: 2, complete: true } },
        { property: 'dacTypeOfFinance', values: { used: 2, of: 2, complete: true } },
    ]);
    // The document lists only part of DAC1AidTypeEnum.
    assert.deepEqual(model.valuesUsed(DAC1, 'dac1AidType'), { used: 12, of: 17, complete: false });
    assert.equal(model.valuesUsed(DAC1, 'financingProvider'), null);
    assert.equal(model.datasetView('provenance/Nothing'), undefined);
});

test('the scoped list of DFO properties groups rows and counts the chosen dataset', () => {
    const list = model.scopedList({ kind: 'dfo' }, { kind: 'dataset', id: DAC2B });
    assert.deepEqual(list.columns, [DAC2B]);
    assert.equal(list.total, 70);
    assert.deepEqual(
        GROUPS.map((group) => list.groups[group].length),
        [2, 2, 8, 58],
    );
    // The start screen counts the same properties without building the list.
    assert.deepEqual(
        model.dfoProperties().toSorted(),
        GROUPS.flatMap((group) => list.groups[group].map((row) => row.id)).toSorted(),
    );
    // amount is a base property, so outside this scope.
    assert.ok(list.groups.measured.every((row) => row.id !== 'amount'));

    const flowType = list.groups.split.find((row) => row.id === 'financialFlowType');
    assert.deepEqual(flowType?.counts, [14]);
    assert.equal(flowType?.dimmed, false);
    assert.deepEqual(flowType?.values, { used: 1, of: 14, complete: true });
    assert.deepEqual(flowType?.valueList?.lists, ['FinancialFlowTypeEnum']);

    const dac1 = list.groups.split.find((row) => row.id === 'dac1AidType');
    assert.deepEqual(dac1?.counts, [0]);
    assert.equal(dac1?.dimmed, true);
    assert.equal(dac1?.values, null);
});

test('the scoped list of a class with every dataset as a column', () => {
    const list = model.scopedList({ kind: 'class', id: 'FinancialFlow' }, { kind: 'all' });
    assert.deepEqual(list.columns, [DAC1, DAC2A, DAC2B, CLIMATE]);
    assert.equal(list.total, 34);
    const row = list.groups.split.find((entry) => entry.id === 'dacTypeOfFinance');
    assert.deepEqual(row?.counts, [259, 12, 10, 0]);
    // A column of zeros dims nothing while every dataset has its own column.
    assert.equal(row?.dimmed, false);
    assert.equal(row?.inheritedFrom, 'FinancingEvent');
    assert.equal(row?.values, null);

    assert.deepEqual(model.scopedList({ kind: 'dfo' }, { kind: 'none' }).columns, []);
});

test('the lens says which nodes a dataset uses, and how many members of a value list', () => {
    assert.deepEqual(
        model.lens(DAC2B, ['financialFlowType', 'FinancialFlowTypeEnum', 'dac1AidType']),
        [
            { id: 'financialFlowType', count: 14, used: true, members: null },
            {
                id: 'FinancialFlowTypeEnum',
                count: 0,
                used: true,
                members: { used: 1, of: 14, complete: true },
            },
            { id: 'dac1AidType', count: 0, used: false, members: null },
        ],
    );
});

test("a value list's use is read from its members, as the lens reads it", () => {
    // No pattern names DAC2aAidTypeEnum itself, but DAC2A uses all 21 of its members.
    assert.equal(model.usage('DAC2aAidTypeEnum').total, 0);
    assert.deepEqual(model.memberUse('DAC2aAidTypeEnum'), [
        { dataset: DAC2A, values: { used: 21, of: 21, complete: true } },
    ]);
    assert.deepEqual(model.memberUse('DAC1AidTypeEnum'), [
        { dataset: DAC1, values: { used: 12, of: 17, complete: false } },
    ]);
    for (const { dataset, values } of model.memberUse('FinancialFlowTypeEnum')) {
        assert.deepEqual(model.lens(dataset, ['FinancialFlowTypeEnum'])[0]?.members, values);
    }
    assert.deepEqual(model.memberUse('CRSPurposeCodeEnum'), []);
});

test('the model is frozen', () => {
    assert.ok(Object.isFrozen(model));
    assert.ok(Object.isFrozen(model.usage('financialFlowType').byDataset));
    assert.ok(Object.isFrozen(model.propertiesOf('FinancialFlow').groups.split));
});

test('a member search matches label, dcid, code or other name, ignoring case and space', () => {
    assert.deepEqual(searchMembers(model, 'FinancialFlowTypeEnum', ' DEBT BUY '), {
        hits: ['Buyback'],
        total: 1,
    });
    const capped = searchMembers(model, 'DAC1AidTypeEnum', '10', 2);
    assert.deepEqual(capped.hits.length, 2);
    assert.ok(capped.total > 2);
    assert.deepEqual(searchMembers(model, 'DAC1AidTypeEnum', '   '), { hits: [], total: 0 });
});

test('a member search matches an open property literal', () => {
    assert.deepEqual(searchMembers(model, 'FinancialPositionTypeEnum', 'dod'), {
        hits: ['AmountOutstanding'],
        total: 1,
    });
});

test('the open properties of a list are those its members carry, each member a cell', () => {
    assert.deepEqual(memberFields(model, model.members('FinancialPositionTypeEnum')), ['wbCode']);
    assert.deepEqual(memberFields(model, model.members('NettingBasisEnum')), []);
    const { fields, cell } = openColumns(model, model.members('CurrencyDenomination'));
    assert.deepEqual(fields, memberFields(model, model.members('CurrencyDenomination')));
    assert.equal(cell('CurrencyCHF', 'dacCode'), '11;70');
    assert.equal(cell('CurrencyCHF', 'nationalCurrencyOf', ', '), 'country/CHE, country/LIE');
    assert.equal(cell('CurrencyCHF', 'wbCode'), '');
});

/**
 * The fixture with the currency status labelled as the graph labels it,
 * "current (currency status)". With `collide`, the euro's status is a second
 * node whose plain name is also "current".
 */
const withStatusLabels = (collide: boolean) => {
    const body = schemaBody() as { nodes: Record<string, unknown>[] };
    const node = (ref: string) => {
        const found = body.nodes.find((each) => each.ref === ref);
        if (found === undefined) throw new Error(`no ${ref}`);
        return found;
    };
    const current = node('CurrencyStatusCurrent');
    current.label = 'current (currency status)';
    if (collide) {
        body.nodes.push({
            ...current,
            ref: 'GroupingCurrent',
            label: 'current (grouping)',
            types: ['Grouping'],
        });
        const euro = node('CurrencyEUR') as { other_properties: Record<string, unknown> };
        euro.other_properties = {
            ...euro.other_properties,
            currencyStatus: [{ ref: 'GroupingCurrent' }],
        };
    }
    return buildModel(readSchema(body), readUsage(usageBody()));
};

test("a plain name leaves out a closing parenthesis that names one of the node's types", () => {
    const labelled = withStatusLabels(false);
    assert.equal(plainName(labelled, 'CurrencyStatusCurrent'), 'current');
    assert.equal(plainName(labelled, 'DAC1AidType1010'), 'official development assistance');
    assert.equal(plainName(labelled, 'CurrencyEUR'), 'Euro');
    assert.equal(plainName(labelled, 'NotANode'), 'NotANode');
});

test('an open property cell names a held reference by its plain name, a reference the model lacks by its dcid', () => {
    const { cell } = openColumns(withStatusLabels(false), model.members('CurrencyDenomination'));
    assert.equal(cell('CurrencyCHF', 'currencyStatus'), 'current');
    assert.equal(cell('CurrencyEUR', 'currencyStatus'), 'current');
    assert.equal(cell('CurrencyCHF', 'nationalCurrencyOf'), 'country/CHE;country/LIE');
});

test('references that share a plain name in one column keep their full labels', () => {
    const { cell } = openColumns(withStatusLabels(true), model.members('CurrencyDenomination'));
    assert.equal(cell('CurrencyCHF', 'currencyStatus'), 'current (currency status)');
    assert.equal(cell('CurrencyEUR', 'currencyStatus'), 'current (grouping)');
});

for (const [cells, head, width] of [
    // The longest cell, when no cap or head word asks for more.
    [['AFN', 'CHF'], 'code', 4],
    [['country/AFG'], 'nationalCurrencyOf', 18],
    // Past the cap a cell wraps at its spaces; a piece ends at a "/".
    [['country/CHE, country/LIE'], 'of', 16],
    [['provenance/ExtraordinarilyLongDatasetName'], 'source', 30],
    // The head's longest word sets the floor.
    [['11'], 'ISO 4217 currency number', 8],
    [[], 'dac code', 4],
] as const) {
    test(`a code column of ${JSON.stringify(cells)} under "${head}" is ${width} characters wide`, () => {
        assert.equal(cellWidth(cells, head), width);
    });
}

test('a member search matches the label of a held node a member refers to', () => {
    assert.deepEqual(searchMembers(model, 'CurrencyDenomination', 'current'), {
        hits: ['CurrencyEUR', 'CurrencyCHF'],
        total: 2,
    });
    // A reference the model lacks matches by no text of its own.
    assert.equal(searchMembers(model, 'CurrencyDenomination', 'country/che').total, 0);
});

test('a scoped list filter keeps rows by label or dcid, and blank text keeps every row', () => {
    const list = model.scopedList({ kind: 'dfo' }, { kind: 'none' });
    assert.equal(filterScopedList(model, list, ' '), list.groups);
    const kept = filterScopedList(model, list, 'NETTING');
    assert.deepEqual(
        kept.split.map((row) => row.id),
        ['nettingBasis'],
    );
    assert.deepEqual([...kept.measured, ...kept.between, ...kept.unused], []);
});

test('a term outside the model is a class when it is a Class, else a property', () => {
    assert.equal(kindOfTerm({ types: ['Class'] }), 'class');
    assert.equal(kindOfTerm({ types: ['Property'] }), 'property');
});
