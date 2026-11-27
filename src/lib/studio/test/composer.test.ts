/**
 * `composer.ts`: the composer's foot branch, what a sent draft does, the
 * amendment cap while a plan is live, and which field copy shows.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    amendmentCount,
    type ComposerPlan,
    composerField,
    composerMode,
    followUpAction,
} from '../composer.ts';
import { INTERRUPT_TEXT_MAX } from '../interruptText.ts';

const live: ComposerPlan = { live: true, switching: null };
const readOnly: ComposerPlan = { live: false, switching: null };
const switching: ComposerPlan = { live: true, switching: { choiceId: 'c1', optionId: 'o2' } };
const card = { id: 'cmp_1', title: 'Aid to Kenya' };
const overCap = 'a'.repeat(INTERRUPT_TEXT_MAX + 1);

test('the foot shows the wall first, then a clarify picker with no plan, else the field', () => {
    for (const [walled, plan, clarify, mode] of [
        [true, null, true, 'wall'],
        [true, live, false, 'wall'],
        [false, null, true, 'clarify'],
        [false, live, true, 'input'],
        [false, readOnly, true, 'input'],
        [false, null, false, 'input'],
    ] as const) {
        assert.equal(composerMode({ walled, plan, clarify }), mode, `${walled} ${plan} ${clarify}`);
    }
});

test('a draft is sent as an amendment, a card follow-up, a follow-up, or held', () => {
    for (const [name, input, action] of [
        ['empty', { draft: '  ', plan: null, editTarget: null }, { kind: 'hold' }],
        [
            'switch in flight',
            { draft: 'more', plan: switching, editTarget: null },
            { kind: 'hold' },
        ],
        ['over the cap', { draft: overCap, plan: live, editTarget: null }, { kind: 'hold' }],
        [
            'live plan, even with a card',
            { draft: ' only 2020 ', plan: live, editTarget: card },
            { kind: 'amend', text: 'only 2020' },
        ],
        [
            'read-only plan asks again',
            { draft: ' why? ', plan: readOnly, editTarget: null },
            { kind: 'send', text: ' why? ' },
        ],
        [
            'over the cap with no live plan',
            { draft: overCap, plan: readOnly, editTarget: null },
            { kind: 'send', text: overCap },
        ],
        [
            'card',
            { draft: 'and 2019? ', plan: null, editTarget: card },
            {
                kind: 'card',
                text: 'and 2019? ',
                options: { componentId: 'cmp_1', intent: 'follow_up', title: 'Aid to Kenya' },
            },
        ],
        ['plain', { draft: 'why?', plan: null, editTarget: null }, { kind: 'send', text: 'why?' }],
    ] as const) {
        assert.deepEqual(followUpAction(input), action, name);
    }
});

test('the amendment cap counts the trimmed draft only while the plan is live', () => {
    assert.equal(amendmentCount(` ${'a'.repeat(INTERRUPT_TEXT_MAX)} `, live).over, false);
    assert.equal(amendmentCount(overCap, live).over, true);
    assert.equal(amendmentCount(overCap, readOnly).count, 0);
    assert.equal(amendmentCount(overCap, null).count, 0);
});

test('a live plan sets the field copy, then a targeted card, else the plain follow-up', () => {
    const plain = composerField({ plan: null, editTarget: null });
    const about = composerField({ plan: readOnly, editTarget: card });
    const amend = composerField({ plan: live, editTarget: null });

    assert.deepEqual(composerField({ plan: live, editTarget: card }), amend);
    assert.deepEqual(composerField({ plan: readOnly, editTarget: null }), plain);
    assert.equal(new Set([plain, about, amend].map((copy) => copy.placeholder)).size, 3);
    assert.equal(new Set([plain, about, amend].map((copy) => copy.label)).size, 3);
});
