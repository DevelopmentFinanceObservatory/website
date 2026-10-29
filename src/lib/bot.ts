import { isbot } from 'isbot';

/** A crawler, link-preview fetcher or script, by its user agent. A request
 *  with no user agent comes from a script, so it counts as a bot. */
export const isBotAgent = (userAgent: string | null | undefined): boolean =>
    !userAgent || isbot(userAgent);

/** Whether an event's request came from a bot. An event with no request
 *  behind it (null headers) is the server's own, never a bot's. */
export const isBotRequest = (headers: Headers | null): boolean =>
    headers !== null && isBotAgent(headers.get('user-agent'));
