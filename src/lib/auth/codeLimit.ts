import { createHmac } from 'node:crypto';

import { limiterBucket } from '../proxy/caller.ts';
import { countHit, refundHit, type CounterDb } from '../proxy/limitCounter.ts';
import { inboxOf } from './inbox.ts';

/**
 * Caps on sign-in codes sent, counted in the shared limiter
 * (src/lib/proxy/limitCounter, table `limit_counter`) so they hold across
 * every server instance: per address, so nobody can flood one inbox, and per
 * network, so one source cannot spray codes at many. Each cap is a fixed
 * window aligned to the clock hour, so up to twice a cap can pass across an
 * hour boundary (five sends at 12:59 and five more at 13:00).
 *
 * Keys are `sign-in-code:` and an HMAC-SHA-256 digest under the auth secret,
 * so the table holds no email address and no IP.
 */
export const CODE_LIMITS = {
    /** Codes per window to one address. */
    address: 5,
    /** Codes per window from one network (an IPv4 address or an IPv6 /64). */
    network: 20,
    windowS: 60 * 60,
} as const;

export type CodeLimitKey = { key: string; max: number };

/**
 * The keys one send counts against: the inbox and the network. Sends with
 * no known client address share one network key, so a broken proxy
 * setting caps them together.
 */
export const codeLimitKeys = (
    secret: string,
    email: string,
    clientIp: string | null,
): CodeLimitKey[] => {
    const digest = (value: string) =>
        `sign-in-code:${createHmac('sha256', secret).update(value).digest('hex')}`;
    const network = clientIp ? limiterBucket(clientIp) : 'unknown';

    return [
        { key: digest(`address:${inboxOf(email)}`), max: CODE_LIMITS.address },
        { key: digest(`network:${network}`), max: CODE_LIMITS.network },
    ];
};

export type Allowance = { ok: true } | { ok: false; retryAfterS: number };

/**
 * Count one send against every key. Refused when any key is past its cap,
 * with the seconds until the latest refusing window ends. A refused send
 * gives back the hit on every key, so it charges nothing. Sends a capped
 * network key refuses cannot use up an inbox's cap.
 */
export const takeCodeAllowance = async (
    db: CounterDb,
    keys: CodeLimitKey[],
    windowS: number = CODE_LIMITS.windowS,
): Promise<Allowance> => {
    const verdicts = await Promise.all(keys.map(({ key, max }) => countHit(db, key, max, windowS)));
    const refused = verdicts.filter(({ allowed }) => !allowed);

    if (refused.length === 0) {
        return { ok: true };
    }

    await Promise.all(keys.map(({ key }) => refundHit(db, key, windowS)));

    return { ok: false, retryAfterS: Math.max(...refused.map(({ reset }) => reset)) };
};
