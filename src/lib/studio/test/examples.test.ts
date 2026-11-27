import assert from 'node:assert/strict';
import test from 'node:test';

import { studioHref } from '../../search/studioHandoff.ts';
import { EXAMPLE_PROMPTS, handoffPromptSource, pickExamples, routedArrival } from '../examples.ts';

test('pickExamples draws three distinct prompts from the pool', () => {
    for (let run = 0; run < 200; run++) {
        const drawn = pickExamples();

        assert.equal(drawn.length, 3);
        assert.equal(new Set(drawn).size, 3);
        assert.ok(drawn.every((prompt) => (EXAMPLE_PROMPTS as readonly string[]).includes(prompt)));
    }
});

test('pickExamples can reach the last prompt in the pool', () => {
    // random() just under 1 picks the last remaining item first.
    assert.equal(pickExamples(['a', 'b', 'c', 'd'], 2, () => 0.999)[0], 'd');
});

test('pickExamples returns the whole pool when it is smaller than the count', () => {
    assert.deepEqual(pickExamples(['a', 'b'], 3, () => 0).sort(), ['a', 'b']);
});

test('handoffPromptSource reads only via=example as a search example', () => {
    assert.equal(handoffPromptSource('example'), 'search_example');

    for (const via of [null, '', 'typed', 'Example']) {
        assert.equal(handoffPromptSource(via), undefined);
    }
});

test("only the router's automatic move arrives as routed, with the search's trace id", () => {
    const arrival = (href: string) =>
        routedArrival(new URL(href, 'https://example.org').searchParams);

    assert.deepEqual(
        arrival(studioHref('aid & debt', 'tok', { via: 'route_auto', traceId: 'trace-1' })),
        { question: 'aid & debt', traceId: 'trace-1' },
    );

    for (const href of [
        studioHref('aid & debt', null, { via: 'route_offer', traceId: 'trace-1' }),
        studioHref('aid & debt', null, { via: 'example' }),
        studioHref('aid & debt', null),
        '/studio?via=route_auto&trace=trace-1',
    ]) {
        assert.equal(arrival(href), null, href);
    }
});
