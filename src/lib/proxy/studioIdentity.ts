import { accountFor } from './account';
import { requestCaller } from './caller';

import type { ForwardOptions } from './forward';

// The Studio routes that name their caller to the harness, which logs both
// on the turn: the visitor's x-dfo-caller (src/lib/proxy/caller) and, for a
// signed-in user, the account digest the event export also writes
// (src/lib/proxy/account).
const IDENTIFIED_ROUTES = new Set(['turn', 'interrupt', 'resume']);

// How long forward() waits on the session read before it sends the call
// without an account. The Studio proxy's ownership check reads the session
// first, through the same once-per-request read, waits up to its own
// OWNERSHIP_TIMEOUT_MS and refuses the call with 503 when the read does not
// answer (src/lib/studio/studioAccess), so a call that reaches this wait
// finds the read already settled.
const ACCOUNT_TIMEOUT_MS = 1_000;

// Built once, so an unset EXPORT_ID_HMAC_KEY logs its warning once per process.
const defaultAccountOf = accountFor(process.env);

type Identity = Pick<ForwardOptions, 'caller' | 'account'>;

/**
 * The caller and account options for a Studio `route`: both for an identified
 * route, neither for any other. `readUserId` reads the signed-in user's id,
 * and runs only when forward() asks for the account. A read that rejects, or
 * has not answered within `timeoutMs`, sends the call without an account.
 */
export const studioIdentity = (
    route: string,
    incoming: Headers,
    readUserId: () => Promise<string | null>,
    { accountOf = defaultAccountOf, timeoutMs = ACCOUNT_TIMEOUT_MS } = {},
): Identity => {
    if (!IDENTIFIED_ROUTES.has(route)) {
        return {};
    }

    return {
        caller: requestCaller(incoming),
        account: async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;

            try {
                const userId = await Promise.race([
                    readUserId(),
                    new Promise<never>((_, reject) => {
                        timer = setTimeout(
                            () => reject(new Error(`no answer within ${timeoutMs} ms`)),
                            timeoutMs,
                        );
                    }),
                ]);

                return accountOf(userId);
            } catch (error) {
                console.error('studio: the session was not read for x-dfo-account', error);

                return undefined;
            } finally {
                clearTimeout(timer);
            }
        },
    };
};
