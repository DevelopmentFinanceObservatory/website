/**
 * The snippet in `conversationSearch.ts` reads message texts and the title of
 * the card a user message names. Other stored fields do not match.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { snippetOf } from '../conversationSearch.ts';

test('a card title a user message names is a search hit', () => {
    const messages = [
        { role: 'user', text: 'Make it a bar chart', card: { title: 'Health aid to Ghana' } },
        { role: 'bot', text: 'Done.' },
    ];

    assert.equal(snippetOf(messages, 'ghana'), 'Health aid to Ghana');
});

test('message text matches before a later card title, and stored plans never match', () => {
    const messages = [
        { role: 'user', text: 'How much aid did Ghana get?' },
        {
            role: 'bot',
            text: 'About 1 billion dollars.',
            plan: { title: 'Net disbursements to Kenya' },
        },
        { role: 'user', text: 'Edit', card: { title: 'Ghana chart' } },
    ];

    assert.equal(snippetOf(messages, 'ghana'), 'How much aid did Ghana get?');
    assert.equal(snippetOf(messages, 'kenya'), undefined);
    assert.equal(snippetOf('not a list', 'ghana'), undefined);
});
