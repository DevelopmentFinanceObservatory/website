/**
 * `proxyCodes.ts`: the `/codes/{code}` answers for the codes the proxy raises itself.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { REGISTRY_CODES, rateLimitedProblem, unreachableProblem } from '../problem.ts';
import { proxyCodeEntry } from '../proxyCodes.ts';

// Read from the file, so the expected split does not come from the module under test.
const { codes } = JSON.parse(
    readFileSync(new URL('../proxy-codes.json', import.meta.url), 'utf8'),
) as { codes: { code: string; status: number; condition: string }[] };
const PROXY_CODES = new Set(codes.map(({ code }) => code));

for (const code of REGISTRY_CODES) {
    const isProxyCode = PROXY_CODES.has(code);

    test(`proxyCodeEntry: ${code} is ${isProxyCode ? 'answered here' : 'left to the API'}`, () => {
        assert.equal(proxyCodeEntry(code) !== undefined, isProxyCode);
    });
}

test('proxyCodeEntry: every proxy code in the contract is a registry code, so its type resolves', () => {
    for (const code of PROXY_CODES) {
        assert.ok((REGISTRY_CODES as readonly string[]).includes(code), code);
    }
});

test('proxyCodeEntry: the body has the API registry entry shape, titled as the problem document is', async () => {
    const [{ code, condition }] = codes.filter(({ code }) => code === 'rate_limited');
    const problem = await rateLimitedProblem({ limit: 1, reset: 1 }, {}).json();

    assert.deepEqual(proxyCodeEntry(code), {
        code,
        classification: 'refusal',
        definition: condition,
        lifecycle: 'active',
        mappings: [],
        title: problem.title,
        detail: null,
    });
    assert.equal(
        proxyCodeEntry('transient_unavailable')?.title,
        (await unreachableProblem('x', {}).json()).title,
    );
});
