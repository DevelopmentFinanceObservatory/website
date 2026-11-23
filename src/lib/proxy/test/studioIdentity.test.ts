/**
 * `studioIdentity.ts`: the default account resolver is built once, so an
 * unset EXPORT_ID_HMAC_KEY logs one warning however many calls are made.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import test from 'node:test';

delete process.env.EXPORT_ID_HMAC_KEY;
process.env.CALLER_HMAC_KEY = 'test-key';
process.env.TRUSTED_PROXY_HOPS = '0';

// The resolver takes console.warn when the module loads, so replace it first.
const warnings: unknown[][] = [];
console.warn = (...args: unknown[]) => void warnings.push(args);

const { studioIdentity } = await import('../studioIdentity.ts');

test('studioIdentity: two calls with the key unset log one warning', async () => {
    for (let call = 0; call < 2; call += 1) {
        const { account } = studioIdentity('turn', new Headers(), async () => 'user_1');

        assert.equal(await account?.(), undefined);
    }

    assert.equal(warnings.length, 1);
});
