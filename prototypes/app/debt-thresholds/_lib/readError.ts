// What the page shows a reader when a browser read fails, which is the error's code in
// small text beside a short sentence the section writes. The full error goes to the console.

/** The public API the browser reads from, as `lib/liveRef.ts`'s client defaults to. */
export const API_ORIGIN = 'https://developmentfinance.org/api/v1';

/**
 * The code a failed read shows. It is the client's error code, such as `network_error`,
 * or for an error with none, its name and the API it was reading. A browser reports a refused
 * cross-origin request as a bare `TypeError`, so the origin is the useful part.
 */
export const readErrorCode = (error: Error): string => {
    const code: unknown = 'code' in error ? error.code : null;

    return typeof code === 'string' ? code : `${error.name} from ${API_ORIGIN}`;
};
