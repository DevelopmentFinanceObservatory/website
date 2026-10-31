import assert from 'node:assert/strict';
import test from 'node:test';

import {
    changeTarget,
    refineItems,
    refineKey,
    sameMenuChanges,
    type RefineItem,
} from '../refineMenu.ts';
import type { PartSpec, SentenceToken } from '../types.ts';
import type { EntityOptionsBySpec } from '../view.ts';
import { servedAnswer, type ServedAnswer } from './fixtures/served-answer.ts';
import {
    servedAid,
    servedAidSector,
    servedDebt,
    servedDebtEvents,
    servedGdp,
    servedGdpEvents,
    servedHealth,
    servedHealthEvents,
    servedMulti,
} from './fixtures/served-options.ts';
import { methodUnbound } from './fixtures/method-unbound.ts';
import { partialSpec } from './fixtures/partial.ts';

const refineOf = (answer: ServedAnswer, entityOptionsBySpec: EntityOptionsBySpec = {}) =>
    refineItems({ ...answer, entityOptionsBySpec });

const keysOf = (items: RefineItem[]) =>
    items.map((item) => [item.key, item.kind === 'entity' ? null : item.current]);

// A plan from a wire before `states`: each token states its own
// binding_ref alone.
const withoutStates = (answer: ServedAnswer): ServedAnswer => ({
    ...answer,
    plan: answer.plan.map((token): SentenceToken => ({ ...token, states: undefined })),
});

test('refineItems lists only the bindings no token states, across dataset families', () => {
    const cases: [string, ServedAnswer, string[]][] = [
        // "gross ODA disbursements" states flow, flow type and netting basis.
        [
            'CRS aid',
            servedAnswer(servedAid),
            ['how:crsCooperationModality', 'how:crsPurpose', 'how:crsTypeOfFinance'],
        ],
        // The sector token states the sector it binds.
        [
            'CRS aid for one sector',
            servedAnswer(servedAidSector),
            ['how:crsCooperationModality', 'how:crsTypeOfFinance'],
        ],
        // "external debt service" states financial flow type; "all
        // creditors" states the open origin role. Two slots have no
        // options, and five (guarantee status, IMF credit, maturity band,
        // net of, netting basis) have one uncounted option each, which
        // narrows nothing.
        [
            'IDS debt',
            servedAnswer(servedDebt, servedDebtEvents),
            ['how:idsCreditorType', 'how:idsDebtorType'],
        ],
        // "GDP" states activity source.
        ['WDI GDP', servedAnswer(servedGdp, servedGdpEvents), ['how:economicSector']],
        // "health expenditure" states both slots.
        ['WDI health', servedAnswer(servedHealth, servedHealthEvents), []],
    ];

    for (const [name, answer, refs] of cases) {
        assert.deepEqual(
            keysOf(refineOf(answer)),
            refs.map((ref) => [refineKey(0, ref), null]),
            name,
        );
    }
});

test("refineItems reads each part's own tokens in a multi-part answer and leaves out a role its token states", () => {
    const answer = servedAnswer(servedMulti);
    const aid = answer.parts[0].spec.spec_id;
    const donors: EntityOptionsBySpec = {
        [aid]: [
            {
                role: 'origin',
                entity_ref: null,
                options: [
                    {
                        value: {
                            ref: { ref: 'country/DEU', label: 'Germany' },
                            value_kind: 'entity',
                        },
                    },
                ],
                truncated: false,
            },
        ],
    };

    // "86 donors" states origin:, and the health part's measure states
    // both its slots.
    assert.deepEqual(keysOf(refineOf(answer, donors)), [
        [refineKey(0, 'how:crsCooperationModality'), null],
        [refineKey(0, 'how:crsPurpose'), null],
        [refineKey(0, 'how:crsTypeOfFinance'), null],
    ]);

    // With no token stating it, the open role is listed after the slots.
    const unstated = {
        ...answer,
        plan: answer.plan.filter((token) => token.binding_ref !== 'origin:'),
    };

    assert.deepEqual(refineOf(unstated, donors).at(-1)?.key, refineKey(0, 'origin:'));
});

test('refineItems lists a bound binding no token states with its current value, and leaves out one whose only option is its current value', () => {
    // Without `states`, the measure token states nothing: flow (ODA, two
    // other served flows) comes to Refine; flow type and netting basis have
    // no options.
    assert.deepEqual(keysOf(refineOf(withoutStates(servedAnswer(servedAid)))), [
        [refineKey(0, 'how:crsCooperationModality'), null],
        [refineKey(0, 'how:crsPurpose'), null],
        [refineKey(0, 'how:crsTypeOfFinance'), null],
        [refineKey(0, 'how:crsTypeOfFlow'), 'official development assistance'],
    ]);
    // Health's two slots each serve only their current value.
    assert.deepEqual(
        keysOf(refineOf(withoutStates(servedAnswer(servedHealth, servedHealthEvents)))),
        [],
    );
});

test('refineItems lists a slot bound to a set whose options are that set, since one member narrows it', () => {
    const member = (dcid: string) => ({ value_kind: 'entity', ref: { ref: dcid, label: dcid } });
    // A Refine part's spec has a spec_id, which partialSpec leaves optional; the fixture names one.
    const spec = partialSpec({
        spec_id: 'sex-set',
        slots: [
            {
                key: { axis: 'how', property: { ref: 'sex' }, label: 'sex' },
                binding: { kind: 'set', values: [member('Female'), member('Male')] },
            },
        ],
    }) as PartSpec;
    const options = [member('Female'), member('Male')].map((value) => ({ value }));

    assert.deepEqual(
        keysOf(
            refineOf({
                plan: [],
                partCount: 1,
                parts: [{ index: 0, variableText: null, spec }],
                optionsBySpec: { 'sex-set': { 'how:sex': { options, truncated: false } } },
            }),
        ),
        [[refineKey(0, 'how:sex'), 'Female, Male']],
    );
});

test('refineItems leaves out the source slot while a token states "source:", on a wire with or without states', () => {
    // Three sources publish gross value added in India, under seven
    // methods no token states.
    const answer = servedAnswer(methodUnbound);
    const method = [refineKey(0, 'method:'), null];

    assert.deepEqual(keysOf(refineOf(answer)), [method]);
    assert.deepEqual(keysOf(refineOf(withoutStates(answer))), [method]);
    assert.deepEqual(
        keysOf(
            refineOf({ ...answer, plan: answer.plan.filter((token) => token.axis !== 'source') }),
        ),
        [[refineKey(0, 'source:'), null], method],
    );
});

test('changeTarget opens the token that states a binding when its menu offers a choice, else Refine', () => {
    const plan: SentenceToken[] = [
        { kind: 'slot', axis: 'what', text: 'debt service', segment: 'heading', states: [] },
        { kind: 'text', text: ' in ', segment: 'heading' },
        { kind: 'slot', axis: 'when', text: '2024', segment: 'heading', states: ['when:'] },
        { kind: 'slot', axis: 'unit', text: 'US dollars', segment: 'byline', states: ['unit:'] },
    ];
    const target = (bindingRef: string, menuChanges: Map<number, Set<string>>) =>
        changeTarget({
            plan,
            partCount: 1,
            partIndex: 0,
            bindingRef,
            menuChanges,
            refineKeys: new Set([refineKey(0, 'origin:')]),
        });
    const drawn = new Map([
        [2, new Set(['when:'])],
        [3, new Set<string>()],
    ]);

    assert.deepEqual(target('when:', drawn), { kind: 'token', index: 2 });
    // The unit token states the ref, but its menu offers nothing else.
    assert.equal(target('unit:', drawn), null);
    // No token states the role: Refine lists it.
    assert.deepEqual(target('origin:', drawn), { kind: 'refine', key: refineKey(0, 'origin:') });
    // Neither a token nor Refine offers the slot.
    assert.equal(target('how:crsTypeOfFlow', drawn), null);

    assert.equal(sameMenuChanges(drawn, new Map(drawn)), true);
    assert.equal(sameMenuChanges(drawn, new Map([[2, new Set(['when:'])]])), false);
});
