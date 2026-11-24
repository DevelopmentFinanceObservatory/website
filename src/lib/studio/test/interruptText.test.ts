/**
 * The 16,000-character cap on an amendment or a free-text answer: what the
 * field counts, when it shows the count, and how a harness 422 is read.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    INTERRUPT_TEXT_MAX,
    interruptTextCount,
    isTextTooLong,
    TEXT_TOO_LONG_MESSAGE,
} from '../interruptText.ts';
import { runInterrupt, runTurn, type StreamRefusal } from '../studioClient.ts';
import type { StudioFrame } from '../wire.ts';

test('interruptTextCount: the count shows from 1,000 short of the limit and blocks past it', () => {
    const at = (n: number) => interruptTextCount('x'.repeat(n));

    assert.deepEqual(at(14_999), { count: 14_999, show: false, over: false });
    assert.deepEqual(at(15_000), { count: 15_000, show: true, over: false });
    assert.deepEqual(at(INTERRUPT_TEXT_MAX), {
        count: INTERRUPT_TEXT_MAX,
        show: true,
        over: false,
    });
    assert.deepEqual(at(INTERRUPT_TEXT_MAX + 1), {
        count: INTERRUPT_TEXT_MAX + 1,
        show: true,
        over: true,
    });
});

test('interruptTextCount: an astral character counts once, as the harness counts', () => {
    // 8,001 emoji are 16,002 UTF-16 units and 8,001 code points.
    assert.deepEqual(interruptTextCount('😀'.repeat(8_001)), {
        count: 8_001,
        show: false,
        over: false,
    });
    assert.deepEqual(interruptTextCount('😀'.repeat(7_600)), {
        count: 7_600,
        show: false,
        over: false,
    });
    assert.equal(interruptTextCount('😀'.repeat(15_500)).show, true);
    assert.equal(interruptTextCount('😀'.repeat(INTERRUPT_TEXT_MAX + 1)).over, true);
});

test('isTextTooLong: reads the type in a 422 detail list and nothing else', () => {
    const body = { detail: [{ type: 'string_too_long', loc: ['body', 'payload'] }] };

    assert.equal(isTextTooLong(422, body), true);
    assert.equal(
        isTextTooLong(422, { detail: [{ type: 'too_long', loc: ['body', 'payload'] }] }),
        false,
    );
    assert.equal(
        isTextTooLong(422, {
            detail: [{ type: 'string_too_long', loc: ['body', 'answers', 'q1', 'text'] }],
        }),
        true,
    );
    assert.equal(
        isTextTooLong(422, {
            detail: [{ type: 'string_too_long', loc: ['body', 'conversation_id'] }],
        }),
        false,
    );
    assert.equal(isTextTooLong(422, { detail: [{ type: 'string_too_long' }] }), false);
    assert.equal(isTextTooLong(422, { detail: 'string_too_long' }), false);
    assert.equal(isTextTooLong(413, body), false);
    assert.equal(isTextTooLong(422, null), false);
});

test('runInterrupt: a 422 string_too_long is a plain message, and onRefusal still sees it', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
        Response.json(
            { detail: [{ type: 'string_too_long', loc: ['body', 'payload'] }] },
            { status: 422 },
        ),
    );
    const frames: StudioFrame[] = [];
    const refusals: StreamRefusal[] = [];

    await runInterrupt(
        'conv',
        'int-1',
        { decision: 'amend', payload: 'x' },
        {
            onFrame: (frame) => frames.push(frame),
            onRefusal: (refusal) => {
                refusals.push(refusal);

                return false;
            },
        },
    );

    assert.equal(refusals[0]?.status, 422);
    assert.equal(frames.length, 1);
    assert.equal(frames[0]?.event === 'error' && frames[0].error.detail, TEXT_TOO_LONG_MESSAGE);
});

test('runTurn: a 422 string_too_long keeps the generic message, and so does another field on /interrupt', async (t) => {
    const refuse = (loc: string[]) =>
        t.mock.method(globalThis, 'fetch', async () =>
            Response.json({ detail: [{ type: 'string_too_long', loc }] }, { status: 422 }),
        );
    const frames: StudioFrame[] = [];
    const onFrame = (frame: StudioFrame) => frames.push(frame);

    refuse(['body', 'payload']);
    await runTurn('conv', 'hello', { onFrame });
    refuse(['body', 'conversation_id']);
    await runInterrupt('conv', 'int-1', { decision: 'amend', payload: 'x' }, { onFrame });

    const details = frames.map((frame) => frame.event === 'error' && frame.error.detail);

    assert.deepEqual(details, ['HTTP 422', 'HTTP 422']);
});
