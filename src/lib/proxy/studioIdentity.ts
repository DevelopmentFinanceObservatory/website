import { accountFor } from './account';
import { requestCaller } from './caller';

import type { ForwardOptions } from './forward';

// The Studio routes that name their caller to the harness, which logs both
// on the turn: the visitor's x-dfo-caller (src/lib/proxy/caller) and, for a
// signed-in user, the account digest the event export also writes
// (src/lib/proxy/account).
const IDENTIFIED_ROUTES = new Set(['turn', 'interrupt']);

// Built once, so an unset EXPORT_ID_HMAC_KEY logs its warning once per process.
const defaultAccountOf = accountFor(process.env);

type Identity = Pick<ForwardOptions, 'caller' | 'account'>;

/**
 * The caller and account options for a Studio `route`: both for an identified
 * route, neither for any other. `readUserId` reads the signed-in user's id,
 * and runs only when forward() asks for the account. A read that rejects sends the
 * call without an account.
 */
export const studioIdentity = (
    route: string,
    incoming: Headers,
    readUserId: () => Promise<string | null>,
    accountOf = defaultAccountOf,
): Identity => {
    if (!IDENTIFIED_ROUTES.has(route)) {
        return {};
    }

    return {
        caller: requestCaller(incoming),
        account: async () => {
            try {
                return accountOf(await readUserId());
            } catch (error) {
                console.error('studio: the session was not read for x-dfo-account', error);

                return undefined;
            }
        },
    };
};
