import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Names the caller for the upstream's logs as `x-dfo-caller: ip:<digest>`,
 * where the digest is HMAC-SHA-256 of the client IP keyed by
 * CALLER_HMAC_KEY, hex, cut to 32 characters. The raw address never leaves
 * the site.
 *
 * The client IP is the X-Forwarded-For entry TRUSTED_PROXY_HOPS places from
 * the right. Each proxy appends the address it saw, so entries to the left
 * of the ones our own front end added are whatever the client sent. On a
 * bare Cloud Run URL the front end appends one entry, so the default 0
 * (the rightmost entry) is the client. Each load balancer in front adds
 * one hop.
 *
 * Without CALLER_HMAC_KEY no caller is sent, and one warning is logged.
 */
export const CALLER_HEADER = 'x-dfo-caller';

const DIGEST_LENGTH = 32;

export type CallerConfig = { key: string; hops: number };

/** Read TRUSTED_PROXY_HOPS from env (default 0), or say why it cannot be used. */
export const trustedHops = (
    env: Record<string, string | undefined>,
): number | { problem: string } => {
    const rawHops = env.TRUSTED_PROXY_HOPS?.trim() || '0';

    if (!/^\d+$/.test(rawHops)) {
        return { problem: `TRUSTED_PROXY_HOPS is not a non-negative integer: ${rawHops}` };
    }

    return Number(rawHops);
};

/**
 * Throw when TRUSTED_PROXY_HOPS in `env` is malformed, so a server that would
 * mis-key its rate limit and caller digest fails at startup. The per-call
 * paths (limiterKeyFor, callerConfig) still degrade rather than guess.
 */
export const assertTrustedHops = (env: Record<string, string | undefined>): void => {
    const hops = trustedHops(env);

    if (typeof hops !== 'number') {
        throw new Error(hops.problem);
    }
};

/** Read the resolver's settings from env, or say why it cannot run. */
export const callerConfig = (
    env: Record<string, string | undefined>,
): CallerConfig | { problem: string } => {
    const key = env.CALLER_HMAC_KEY;

    if (!key) {
        return { problem: 'CALLER_HMAC_KEY is unset' };
    }

    const hops = trustedHops(env);

    return typeof hops === 'number' ? { key, hops } : hops;
};

/**
 * The client's address in an X-Forwarded-For value: the entry `hops` places
 * from the right, or undefined when it is missing or is not an IP address.
 * The rate limiter and the caller digest both key on it.
 */
export const clientAddress = (forwardedFor: string | null, hops: number): string | undefined => {
    const entries = forwardedFor?.split(',').map((entry) => entry.trim()) ?? [];
    const ip = entries[entries.length - 1 - hops];

    return ip && isIP(ip) ? ip : undefined;
};

const LOCAL_ADDRESS = 'local';

/**
 * The rate limiter's key resolver for `hops` (see trustedHops): the client
 * address in an X-Forwarded-For value, or 'local' when it is missing. A
 * malformed TRUSTED_PROXY_HOPS logs one error through `log` and keys every
 * call as 'local', the same refusal callerConfig makes, rather than guess
 * which entry is the client.
 */
export const limiterKeyFor = (
    hops: number | { problem: string },
    log: (message: string) => void = console.error,
): ((forwardedFor: string | null) => string) => {
    if (typeof hops !== 'number') {
        let logged = false;

        return () => {
            if (!logged) {
                logged = true;
                log(`${hops.problem}; rate-limiting /api by an unknown client address`);
            }

            return LOCAL_ADDRESS;
        };
    }

    return (forwardedFor) => clientAddress(forwardedFor, hops) ?? LOCAL_ADDRESS;
};

// An IPv6 address as its eight 16-bit groups, a trailing dotted quad read
// as the last two.
const ipv6Groups = (address: string): number[] => {
    const [head = '', tail] = address.split('%')[0]!.split('::');
    const groups = (part: string) =>
        part
            ? part.split(':').flatMap((group) => {
                  if (!group.includes('.')) {
                      return [parseInt(group, 16)];
                  }

                  const [a = 0, b = 0, c = 0, d = 0] = group.split('.').map(Number);

                  return [a * 256 + b, c * 256 + d];
              })
            : [];
    const left = groups(head);
    const right = groups(tail ?? '');

    return tail === undefined
        ? left
        : [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
};

/**
 * The rate-limit bucket for a client address (see limiterKeyFor): an IPv6
 * address keys by its /64, the block one subscriber is routinely given, so
 * a client cannot take a fresh allowance per source address. An
 * IPv4-mapped IPv6 address keys as its IPv4 address. IPv4 and 'local' pass
 * through.
 */
export const limiterBucket = (address: string): string => {
    if (isIP(address) !== 6) {
        return address;
    }

    const groups = ipv6Groups(address);

    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
        const [high = 0, low = 0] = groups.slice(6);

        return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
    }

    return `${groups
        .slice(0, 4)
        .map((group) => group.toString(16))
        .join(':')}::/64`;
};

/**
 * The caller for an X-Forwarded-For value, or undefined when the client
 * address (see clientAddress) is missing.
 */
export const resolveCaller = (
    forwardedFor: string | null,
    { key, hops }: CallerConfig,
): string | undefined => {
    const ip = clientAddress(forwardedFor, hops);

    if (!ip) {
        return undefined;
    }

    const digest = createHmac('sha256', key).update(ip).digest('hex').slice(0, DIGEST_LENGTH);

    return `ip:${digest}`;
};

/** Set the resolved caller on upstream headers, dropping any other value. */
export const setCaller = (headers: Headers, caller: string | undefined): void => {
    headers.delete(CALLER_HEADER);

    if (caller) {
        headers.set(CALLER_HEADER, caller);
    }
};

const config = callerConfig(process.env);
let warned = false;

/** The caller for an incoming request, from this process's env. */
export const requestCaller = (incoming: Headers): string | undefined => {
    if ('problem' in config) {
        if (!warned) {
            warned = true;
            console.warn(`${config.problem}; MCP calls go upstream without ${CALLER_HEADER}`);
        }

        return undefined;
    }

    return resolveCaller(incoming.get('x-forwarded-for'), config);
};
