// The log half of src/lib/events, in its own module (no db or server-only imports) so
// src/lib/test/events-log.test.ts can exercise it under plain node.

export type EventLogEntry = {
    severity: 'INFO';
    message: 'event';
    name: string;
    props: Record<string, unknown>;
    page: string | null;
    signedIn: boolean;
};

/**
 * The log entry for one usage event. It holds the event's name, props and
 * page, and whether a user was signed in; it holds no `userId` and no
 * `visitorId`, so the log cannot link events to a person. `page` keeps the
 * path alone, as the request log line does: feedback sends its page with
 * the query string. Props carry the clipped query text, and the entry lives
 * as long as the log bucket's retention.
 */
export const eventLogEntry = (
    name: string,
    props: Record<string, unknown>,
    who: { userId?: string | null; page?: string | null },
): EventLogEntry => ({
    severity: 'INFO',
    message: 'event',
    name,
    props,
    page: who.page?.split(/[?#]/, 1)[0] ?? null,
    signedIn: Boolean(who.userId),
});

/**
 * Write the event as one JSON line on stdout, which Cloud Logging stores as
 * a structured entry, so an event joins the dfo-apis resolve line by the
 * `traceId` in its props. Never throws: a logging fault must not fail the
 * request.
 */
export const logEvent = (
    name: string,
    props: Record<string, unknown>,
    who: { userId?: string | null; page?: string | null },
): void => {
    try {
        console.log(JSON.stringify(eventLogEntry(name, props, who)));
    } catch (error) {
        console.error('event log failed', name, error);
    }
};
