import { createHmac } from 'node:crypto';

/**
 * Names a signed-in user to the Studio harness as `x-dfo-account: <digest>`,
 * so its turn log and trace can count accounts without holding an account id.
 * The digest is exportDigest of the user id under EXPORT_ID_HMAC_KEY, the
 * function the event export writes `user_hash` with (exportRow in
 * db/event-export.ts), so a turn joins the account's exported events. A guest
 * gets no header. Without EXPORT_ID_HMAC_KEY no account is sent, and one
 * warning is logged.
 */
export const ACCOUNT_HEADER = 'x-dfo-account';

/**
 * HMAC-SHA-256 of `id` under `key`, hex: the event export's digest of every
 * id it writes (db/event-export.ts) and the x-dfo-account digest. A change
 * here changes the exported rows, so it bumps ROW_SHAPE_VERSION there.
 */
export const exportDigest = (id: string, key: string): string =>
    createHmac('sha256', key).update(id).digest('hex');

/**
 * The resolver from a user id to its account digest, from `env`'s
 * EXPORT_ID_HMAC_KEY. A null user id, or an unset key, gives undefined. The
 * unset key is logged once through `log`.
 */
export const accountFor = (
    env: Record<string, string | undefined>,
    log: (message: string) => void = console.warn,
): ((userId: string | null) => string | undefined) => {
    const key = env.EXPORT_ID_HMAC_KEY;
    let logged = false;

    return (userId) => {
        if (userId === null) {
            return undefined;
        }

        if (!key) {
            if (!logged) {
                logged = true;
                log(`EXPORT_ID_HMAC_KEY is unset; Studio calls go without ${ACCOUNT_HEADER}`);
            }

            return undefined;
        }

        return exportDigest(userId, key);
    };
};

/** Set the account on upstream headers, dropping any other value. */
export const setAccount = (headers: Headers, account: string | undefined): void => {
    headers.delete(ACCOUNT_HEADER);

    if (account) {
        headers.set(ACCOUNT_HEADER, account);
    }
};
