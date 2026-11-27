import assert from 'node:assert/strict';
import test from 'node:test';

import { studioHref } from '../../search/studioHandoff.ts';
import {
    arrivalDraftHref,
    EXAMPLE_PROMPTS,
    handoffPromptSource,
    pickExamples,
    questionParam,
    routedArrival,
    STUDIO_DRAFT_PARAM,
} from '../examples.ts';

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

test('handoffPromptSource reads a search example from a click and from a routed handoff', () => {
    const source = (href: string) =>
        handoffPromptSource(new URL(href, 'https://example.org').searchParams);

    for (const href of [
        studioHref('Aid?', null, { via: 'example' }),
        studioHref('Aid?', null, { via: 'route_auto', fromExample: true }),
        studioHref('Aid?', 'tok', { via: 'route_offer', traceId: 't', fromExample: true }),
    ]) {
        assert.equal(source(href), 'search_example', href);
    }

    for (const href of [
        studioHref('Aid?', null),
        studioHref('Aid?', null, { via: 'route_auto' }),
        '/studio?q=Aid&via=Example',
        '/studio?q=Aid&example=yes',
    ]) {
        assert.equal(source(href), undefined, href);
    }
});

test('arrivalDraftHref turns an arrival into its question as a draft, and nothing else', () => {
    const drafted = (href: string) =>
        arrivalDraftHref(new URL(href, 'https://example.org').searchParams);
    const draftOf = (href: string | null) =>
        href && new URL(href, 'https://example.org').searchParams.get(STUDIO_DRAFT_PARAM);

    for (const href of [
        studioHref('aid & debt', 'tok', {
            via: 'route_auto',
            traceId: 'trace-1',
            fromExample: true,
        }),
        studioHref('aid & debt', 'tok', { via: 'route_offer', traceId: 'trace-1' }),
        studioHref('aid & debt', null, { via: 'example' }),
        studioHref('  aid & debt ', 'tok'),
    ]) {
        const draft = drafted(href);

        assert.equal(draft, '/studio?draft=aid+%26+debt', href);
        assert.equal(draftOf(draft), 'aid & debt', href);
    }

    for (const href of ['/studio', '/studio?q=%20%20', '/studio?via=route_auto&trace=t']) {
        assert.equal(drafted(href), null, href);
    }
});

test('questionParam trims a question and reads a blank one as none', () => {
    const read = (search: string) => questionParam(new URLSearchParams(search), 'q');

    assert.equal(read('q=%20aid%20'), 'aid');
    assert.equal(read('q=%20%20'), null);
    assert.equal(read('q='), null);
    assert.equal(read(''), null);
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
        '/studio?q=%20&via=route_auto&trace=trace-1',
    ]) {
        assert.equal(arrival(href), null, href);
    }
});
