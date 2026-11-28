import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { buildRequest } from '../searchClient.ts';
import { optsIntoStudioRouting, studioRoutingEnabled } from '../studioRoutingSetting.ts';

const saved = process.env.STUDIO_ROUTING_ENABLED;

afterEach(() => {
    if (saved === undefined) delete process.env.STUDIO_ROUTING_ENABLED;
    else process.env.STUDIO_ROUTING_ENABLED = saved;
});

test('studioRoutingEnabled is on only for true, 1, on and yes', () => {
    const cases: [string | undefined, boolean][] = [
        [undefined, false],
        ['', false],
        ['junk', false],
        ['false', false],
        ['0', false],
        ['off', false],
        ['true', true],
        ['1', true],
        ['on', true],
        ['yes', true],
        [' TRUE ', true],
        ['Yes', true],
    ];

    for (const [value, expected] of cases) {
        if (value === undefined) delete process.env.STUDIO_ROUTING_ENABLED;
        else process.env.STUDIO_ROUTING_ENABLED = value;

        assert.equal(studioRoutingEnabled(), expected, String(value));
    }
});

test('a raw_text request carries studio_routing only when the setting is on and routing is not off', () => {
    const input = { kind: 'raw_text', query: 'Why is aid to Kenya falling?' } as const;
    const cases: [boolean, boolean, boolean][] = [
        [false, false, false],
        [false, true, false],
        [true, true, false],
        [true, false, true],
    ];

    for (const [enabled, routingOff, sent] of cases) {
        const studioRouting = optsIntoStudioRouting({ enabled, routingOff });
        const body: Record<string, unknown> = buildRequest(input, true, { studioRouting }).input;

        assert.equal('studio_routing' in body, sent, `${enabled} ${routingOff}`);
    }
});
