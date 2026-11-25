/**
 * `downloadAllowance` counts a download click as the proxy counts any
 * anonymous site call: per visitor with a valid visitor token, else on the
 * address's cookieless count, and names the tier it spent and, on a 429,
 * whose count refused it.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import test from 'node:test';

import type { NextRequest } from 'next/server';

const { downloadAllowance } = await import('../storedFile.ts');
const { accessDeps } = await import('../../proxy/forward.ts');
const { BACKSTOP_LIMITS, COOKIELESS_LIMITS, LIMITS } = await import('../../proxy/rateLimit.ts');
const { mintVisitorToken, visitorKey } = await import('../../proxy/visitor.ts');

test('downloadAllowance: counts per visitor with a valid visitor token, else on the cookieless count', async (t) => {
    const callerKey = process.env.CALLER_HMAC_KEY;
    const original = { ...accessDeps };

    process.env.CALLER_HMAC_KEY = 'download-test-key';
    t.after(() => {
        Object.assign(accessDeps, original);

        if (callerKey === undefined) {
            delete process.env.CALLER_HMAC_KEY;
        } else {
            process.env.CALLER_HMAC_KEY = callerKey;
        }
    });

    const log: string[] = [];
    let allowed = true;
    const verdict = (limit: number) => ({ allowed, limit, remaining: allowed ? 1 : 0, reset: 30 });

    accessDeps.hitAddress = async (surface, _ip, limit) => {
        log.push(`address:${surface}:${limit}`);

        return verdict(limit);
    };
    // Logs the counts of each plan, the call's own then the address's
    // backstop, and refuses on the call's own count when `allowed` is false.
    accessDeps.admit = async (plan) => {
        const [surface, kind] = plan.minute.key.split(':');

        log.push(
            `${kind === 'visitor' ? 'visitor' : 'cookieless'}:${surface}:${plan.minute.limit}`,
        );

        for (const counter of [plan.backstop, plan.day, plan.ceiling]) {
            if (counter) {
                log.push(
                    counter === plan.backstop
                        ? `backstop:${surface}:${counter.limit}`
                        : `daily:${counter.key}:${counter.limit}`,
                );
            }
        }

        return {
            refusedBy: allowed ? null : 'minute',
            verdicts: { minute: verdict(plan.minute.limit) },
        };
    };
    // Logged so the assertions below show the daily allowance is never spent.
    accessDeps.hitDaily = async (counterKey, limit) => {
        log.push(`daily:${counterKey}:${limit}`);

        return verdict(limit);
    };

    const click = (headers: Record<string, string> = {}) =>
        downloadAllowance(
            new Request('http://site.test/s/abc/download', { headers }) as unknown as NextRequest,
        );
    const cookie = `dfo_v=${mintVisitorToken(visitorKey('download-test-key'), Date.now())}`;

    const visitor = await click({ cookie });
    const cookieless = await click();

    assert.equal(visitor.refusal, undefined);
    assert.equal(visitor.headers['x-dfo-limit-tier'], 'visitor');
    assert.equal(cookieless.refusal, undefined);
    assert.equal(cookieless.headers['x-dfo-limit-tier'], 'address');
    assert.deepEqual(log, [
        `visitor:api:${LIMITS.api}`,
        `backstop:api:${BACKSTOP_LIMITS.api}`,
        `cookieless:api:${COOKIELESS_LIMITS.api}`,
        `backstop:api:${BACKSTOP_LIMITS.api}`,
    ]);

    allowed = false;

    const refused = await click();
    const refusedVisitor = await click({ cookie });

    assert.equal(refused.refusal?.status, 429);
    assert.equal((await refused.refusal!.json()).code, 'rate_limited');
    assert.equal(refused.headers['Retry-After'], '30');
    // Whose count refused the click, which the share download's text names.
    assert.equal(refused.scope, 'address');
    assert.equal(refusedVisitor.scope, 'visitor');
});
