import assert from 'node:assert/strict';
import test from 'node:test';

import { readBoundedText } from '../boundedBody.ts';

const CHUNK = 1024;

// An endless chunked body: every pull enqueues one CHUNK of 'x'. Counts the
// bytes the reader drew from it and whether it was cancelled.
const endlessBody = () => {
    const seen = { bytes: 0, cancelled: false };
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            seen.bytes += CHUNK;
            controller.enqueue(new Uint8Array(CHUNK).fill(0x78));
        },
        cancel() {
            seen.cancelled = true;
        },
    });

    return { body, seen };
};

test('readBoundedText stops a chunked body at the cap and reads no further', async () => {
    const { body, seen } = endlessBody();

    assert.equal(await readBoundedText(body, 10 * CHUNK), null);
    assert.ok(seen.cancelled);
    // The cap, the chunk that crossed it, and at most one chunk queued ahead.
    assert.ok(seen.bytes <= 12 * CHUNK, `read ${seen.bytes} bytes`);
});

test('readBoundedText returns a body under the cap, a character split across chunks intact', async () => {
    const bytes = new TextEncoder().encode('{"label":"Côte d’Ivoire"}');
    const split = bytes.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes.slice(0, split));
            controller.enqueue(bytes.slice(split));
            controller.close();
        },
    });

    assert.equal(await readBoundedText(body, 1024), '{"label":"Côte d’Ivoire"}');
});

test('readBoundedText reads a missing body as empty', async () => {
    assert.equal(await readBoundedText(null, 1024), '');
});
