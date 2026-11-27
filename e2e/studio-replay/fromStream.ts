/**
 * Turns saved Studio streams into a replay fixture on stdout:
 *
 *   node e2e/studio-replay/fromStream.ts <name> <question> <turn.sse> [<interrupt.sse> ...]
 *
 * Each file is one response body of the harness, as `curl -N` saves it: the
 * first answers the question's POST /api/studio/turn, each later one the
 * POST /api/studio/interrupt sent at the pause before it. Keep-alive
 * comments are dropped. A later segment needs its `act` (how the reader
 * answers the pause) and `expect` (the interrupt's members) added by hand;
 * docs/development.md, "Studio replay test", has the rest.
 */
import { readFileSync } from 'node:fs';

import type { Frame, Scenario } from './scenario.ts';

const [name, question, ...files] = process.argv.slice(2);

if (!name || !question || files.length === 0) {
    console.error(
        'usage: node e2e/studio-replay/fromStream.ts <name> <question> <turn.sse> [<interrupt.sse> ...]',
    );
    process.exit(2);
}

const framesOf = (file: string): Frame[] =>
    readFileSync(file, 'utf8')
        .split(/\r?\n\r?\n/)
        .map((event) =>
            event
                .split(/\r?\n/)
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart())
                .join('\n'),
        )
        .filter(Boolean)
        // Each data payload is one harness frame.
        .map((data) => JSON.parse(data) as Frame);

const fixture: Scenario = {
    name,
    description: '',
    turns: [{ question, segments: files.map((file) => ({ frames: framesOf(file) })) }],
};

console.log(JSON.stringify(fixture, null, 1));
