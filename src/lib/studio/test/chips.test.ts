/**
 * The chips after an answer: a `suggestions` frame split into prompt
 * follow-ups and `apply_choice` chips, and the transcript after the harness
 * refuses a chip.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    chipKey,
    chipRefusalDetail,
    splitSuggestions,
    withoutChips,
    withRefusedChip,
} from '../chips.ts';
import type { ChatMessage } from '../../../components/organisms/Studio/hooks/useChat.ts';
import type { StudioFrame } from '../wire.ts';

type Suggestions = Extract<StudioFrame, { event: 'suggestions' }>;

/** The harness's wire fixture (`services/harness/tests/wire_fixtures/studio`
 *  in dfo-ai), copied. */
const frame = JSON.parse(
    readFileSync(
        new URL('./fixtures/event-15-suggestions-apply-choice.json', import.meta.url),
        'utf8',
    ),
) as Suggestions;

const [sector, region] = splitSuggestions(frame.items).chips;

test('splitSuggestions: the fixture frame is two chips in frame order, no follow-ups', () => {
    assert.deepEqual(splitSuggestions(frame.items), { followups: [], chips: frame.items });
});

test('splitSuggestions: each chip keeps the turn and spec_id it was offered with', () => {
    const { chips } = splitSuggestions(frame.items);

    assert.deepEqual(
        chips.map(({ turn, spec_id }) => ({ turn, spec_id })),
        frame.items.map((item) => ({
            turn: 'turn' in item ? item.turn : undefined,
            spec_id: 'spec_id' in item ? item.spec_id : undefined,
        })),
    );
    assert.ok(chips.every((chip) => chip.turn >= 1 && chip.spec_id.startsWith('spec_')));
});

test('splitSuggestions: prompt follow-ups keep their prompts beside the chips', () => {
    const prompt = { label: 'By donor', prompt: 'Break this down by donor' };

    assert.deepEqual(splitSuggestions([prompt, ...frame.items]), {
        followups: ['Break this down by donor'],
        chips: frame.items,
    });
});

test('splitSuggestions: an item of another kind is neither a chip nor a follow-up', () => {
    const other = { kind: 'open_card', label: 'Open the card', prompt: 'Open it' };

    assert.deepEqual(splitSuggestions([other as unknown as Suggestions['items'][number]]), {
        followups: [],
        chips: [],
    });
});

const toolError = (pointer: string | null) => ({
    error: 'constraint_violation' as const,
    retry: 'do_not_retry' as const,
    detail: 'This answer has changed since that suggestion was offered, so nothing changed.',
    constraint_id: 'scope_choice_stale',
    pointer,
});

test('chipRefusalDetail: a 422 pointing at /apply_choice gives its detail; others give null', () => {
    const chip = toolError('/apply_choice');

    assert.equal(chipRefusalDetail({ status: 422, detail: chip.detail, error: chip }), chip.detail);
    assert.equal(
        chipRefusalDetail({ status: 422, detail: 'x', error: toolError('/message') }),
        null,
    );
    assert.equal(chipRefusalDetail({ status: 502, detail: 'proxy failed', error: null }), null);
});

test('withRefusedChip: the reply says why and keeps the answer’s other chips and follow-ups', () => {
    assert.ok(sector && region);

    const messages: ChatMessage[] = [
        { role: 'user', text: 'Aid to Africa for health' },
        { role: 'bot', text: 'USD 4.1bn', followups: ['By donor'], chips: [sector, region] },
        { role: 'user', text: sector.label },
        { role: 'bot', text: '' },
    ];

    assert.deepEqual(withRefusedChip(messages, sector, 'Nothing changed.'), [
        ...messages.slice(0, 3),
        { role: 'bot', text: '_Nothing changed._', followups: ['By donor'], chips: [region] },
    ]);
});

test('withRefusedChip: the last chip refused leaves a reply with no chips', () => {
    assert.ok(sector);

    const messages: ChatMessage[] = [
        { role: 'bot', text: 'USD 4.1bn', chips: [sector] },
        { role: 'user', text: sector.label },
        { role: 'bot', text: '' },
    ];

    assert.deepEqual(withRefusedChip(messages, sector, 'Nothing changed.').at(-1), {
        role: 'bot',
        text: '_Nothing changed._',
    });
});

test('withRefusedChip: a chip for another reading of the same choice and option stays', () => {
    assert.ok(sector);

    const other = { ...sector, spec_id: `${sector.spec_id}_other` };
    const messages: ChatMessage[] = [
        { role: 'bot', text: 'USD 4.1bn', chips: [sector, other] },
        { role: 'user', text: sector.label },
        { role: 'bot', text: '' },
    ];

    assert.notEqual(chipKey(sector), chipKey(other));
    assert.deepEqual(withRefusedChip(messages, sector, 'Nothing changed.').at(-1), {
        role: 'bot',
        text: '_Nothing changed._',
        chips: [other],
    });
});

test('withoutChips: a restored transcript keeps its follow-ups and loses its chips', () => {
    assert.ok(sector);

    const messages: ChatMessage[] = [
        { role: 'user', text: 'Aid to Africa for health' },
        { role: 'bot', text: 'USD 4.1bn', followups: ['By donor'], chips: [sector] },
        { role: 'bot', text: 'Done', chips: [sector] },
    ];

    assert.deepEqual(withoutChips(messages), [
        { role: 'user', text: 'Aid to Africa for health' },
        { role: 'bot', text: 'USD 4.1bn', followups: ['By donor'] },
        { role: 'bot', text: 'Done' },
    ]);
});
