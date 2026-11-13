/**
 * The Create Google Sheet control's states, and the trip through Google's
 * consent screen as the return address records it. Better Auth sends the
 * reader back to `callbackURL`, which carries RETURNED_PARAM, when the link
 * succeeds, and to `errorCallbackURL`, which does not, with LINK_ERROR_PARAM
 * added when it fails: the reader declined, or the Google account could not
 * be linked to this one.
 */
import type { SheetsAnswer } from './googleSheet.ts';

/** The parameter Better Auth adds to the return address when the link failed. */
export const LINK_ERROR_PARAM = 'error';

/** The parameter on the return address after a trip that granted Google access. */
export const RETURNED_PARAM = 'google';

type QueryReader = { get(name: string): string | null; has(name: string): boolean };

/** What the return address says about the last trip through Google's consent screen. */
export type ConsentTrip = 'none' | 'granted' | 'refused';

/** The trip a query records. A query with LINK_ERROR_PARAM never counts as granted. */
export const consentTrip = (params: QueryReader): ConsentTrip => {
    if (params.has(LINK_ERROR_PARAM)) return 'refused';
    return params.has(RETURNED_PARAM) ? 'granted' : 'none';
};

/**
 * The success and failure return addresses for a trip from `href`, each a
 * path and query. Both drop a previous trip's parameters; only the success
 * address carries RETURNED_PARAM.
 */
export const consentReturns = (href: string): { callbackURL: string; errorCallbackURL: string } => {
    const back = new URL(href);
    back.searchParams.delete(LINK_ERROR_PARAM);
    back.searchParams.delete(RETURNED_PARAM);
    const errorCallbackURL = `${back.pathname}${back.search}`;
    back.searchParams.set(RETURNED_PARAM, '1');
    return { callbackURL: `${back.pathname}${back.search}`, errorCallbackURL };
};

/**
 * `href` with RETURNED_PARAM set when `params` holds it, so a granted trip
 * is still known after the page rewrites its query.
 */
export const keepReturned = (href: string, params: QueryReader): string => {
    if (consentTrip(params) !== 'granted') return href;
    const [path = '', query = ''] = href.split('?', 2);
    const next = new URLSearchParams(query);
    next.set(RETURNED_PARAM, '1');
    return `${path}?${next.toString()}`;
};

/**
 * The control's state. `needs_google` offers Continue with Google;
 * `renewal_failed` offers Try Again and Continue with Google; `failed`
 * offers neither.
 */
export type CreateState =
    | { kind: 'idle' }
    | { kind: 'working' }
    | { kind: 'created'; url: string; dropdownsFailed: boolean }
    | { kind: 'needs_google'; message: string }
    | { kind: 'renewal_failed'; message: string }
    | { kind: 'failed'; message: string };

const NOT_GRANTED = 'Google access was not granted, so no sheet was created.';

const STILL_REFUSED =
    'Google access was granted, but the tool still cannot use it, so no sheet was created. Sign out, sign in again and try once more; if it fails again, download the CSV.';

const UNANSWERED = 'The sheet could not be created. Try again.';

const UNREACHED = 'The sheet could not be created. Check your connection and try again.';

const CONSENT_UNAVAILABLE = 'Google’s consent screen could not be opened. Try again.';

/** The state the control opens in: after a refused trip, the consent screen is offered again. */
export const initialCreateState = (trip: ConsentTrip): CreateState =>
    trip === 'refused' ? { kind: 'needs_google', message: NOT_GRANTED } : { kind: 'idle' };

/**
 * The state the handler's answer leads to, or null for no answer. A request
 * for Google access right after a granted trip is a refusal the consent
 * screen cannot fix, so it is `failed` and the button is not offered again.
 */
export const answerState = (answer: SheetsAnswer | null, trip: ConsentTrip): CreateState => {
    if (answer === null) return { kind: 'failed', message: UNANSWERED };
    if (answer.ok) {
        return { kind: 'created', url: answer.url, dropdownsFailed: answer.dropdowns === 'failed' };
    }
    switch (answer.code) {
        case 'google_access_needed':
            return trip === 'granted'
                ? { kind: 'failed', message: STILL_REFUSED }
                : { kind: 'needs_google', message: answer.message };
        case 'google_renewal_failed':
            return { kind: 'renewal_failed', message: answer.message };
        default:
            return { kind: 'failed', message: answer.message };
    }
};

/** The state after the request to the handler threw. */
export const UNREACHED_STATE: CreateState = Object.freeze({ kind: 'failed', message: UNREACHED });

/** The state after the consent screen could not be opened. */
export const CONSENT_FAILED_STATE: CreateState = Object.freeze({
    kind: 'failed',
    message: CONSENT_UNAVAILABLE,
});
