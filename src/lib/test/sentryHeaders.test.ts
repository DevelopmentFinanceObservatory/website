/**
 * API keys never reach Sentry. An error and a sampled transaction from a
 * keyed request go through the site's Sentry options under the Node and the
 * Edge SDK (fixtures/sentryEmit.ts), and no `dfo_` text may appear in any
 * event or span. Each runtime runs in its own process, since Sentry is global.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const FIXTURE = fileURLToPath(new URL('./fixtures/sentryEmit.ts', import.meta.url));
const BEARER = 'dfo_live_probeBearerKey0000000000000000';
const ALIAS = 'dfo_live_probeAliasKey00000000000000000';

type Envelope = [Record<string, unknown>, [{ type?: string }, unknown][]];

const emit = (conditions: string[], defaults = false): { raw: string; types: string[] } => {
    const raw = execFileSync(process.execPath, ['--no-warnings', ...conditions, FIXTURE], {
        env: {
            ...process.env,
            PROBE_BEARER: BEARER,
            PROBE_ALIAS: ALIAS,
            SENTRY_EMIT_DEFAULTS: defaults ? '1' : '0',
        },
        encoding: 'utf8',
    });
    const envelopes = JSON.parse(raw) as Envelope[];

    return { raw, types: envelopes.flatMap(([, items]) => items.map(([h]) => h.type ?? '')) };
};

const RUNTIMES = [
    { name: 'Node', conditions: [] },
    { name: 'Edge', conditions: ['--conditions=edge-light'] },
];

for (const { name, conditions } of RUNTIMES) {
    test(`${name}: no key reaches an error or a transaction`, () => {
        const { raw, types } = emit(conditions);

        assert.ok(types.includes('event'), `an error event was sent: ${types.join(', ')}`);
        assert.ok(types.includes('transaction'), `a transaction was sent: ${types.join(', ')}`);
        assert.doesNotMatch(raw, /dfo_/);
        assert.match(raw, /sentry-probe\/1/, 'the user agent is kept');
    });

    test(`${name}: the probe sees the key under Sentry's defaults`, () => {
        // Without this, a probe that stopped carrying headers would pass the
        // test above for the wrong reason.
        assert.match(emit(conditions, true).raw, /dfo_live_probe/);
    });
}
