import 'server-only';

import { isBotRequest } from '@/lib/bot';
import { db } from '@/lib/db';
import { trustedHops } from '@/lib/proxy/caller';
import { event } from '../../../db/schema';
import { isBrowserEventName } from './browserEvents';
import { dayVisitorResolver } from './dayVisitor';
import { logEvent } from './eventLog';
import { parseInternalEng, withInternalEng } from './internalEng';
import { redactSharePage, safeErrorCode } from './limits';
import { posthogConfigured, sendEventToPosthog } from './posthog';

/**
 * Usage events (the analytics in DFO Overview → Data access → "Events to
 * record"), written as one JSON log line (see ./eventLog), stored in our own
 * `event` table and, when POSTHOG_KEY and POSTHOG_HOST are set, forwarded
 * server-side to PostHog (EU cloud): no cookies, no browser-side analytics
 * script, no Studio prompt text. The search events hold the first 500
 * characters of the query. The browser posts its events through /api/events
 * (see ./client); the server records its own directly.
 *
 * Every name the site emits, so a typo can't fork the data:
 * - search.query      an answered search (spec ids, measures and filters, places,
 *                     window, StatVar and place counts)
 * - search.empty      a search the graph couldn't answer (the reasons)
 * - search.edit       an edit to a search answer, re-resolved (its outcome)
 * - search.error      a search post that failed (the error code)
 * - search.abandon    a search post left in flight (hidden, superseded, reset or left)
 * - search.action     a click on a search answer (pick, download, share, ...)
 * - search.start_point  the starting point shown, with no search call
 * - search.studio_handoff  a Studio action on a search answer
 * - studio.prompt     a prompt sent in the Studio (turn and intent, without the text)
 * - studio.card       a card the harness put on the canvas (kind, source, years, unit)
 * - studio.session_end  a Studio session left (turns, cards, pins)
 * - auth.signin       a sign-in (provider)
 * - guest.wall_hit    a guest ran out of free prompts
 * - feedback.submit   a feedback sent (kind)
 * - embed.view        an embed loaded in an iframe (share id, kind, host site)
 * - share.create      a Studio or search share link made (share id, kind, mode)
 * - share.copy        a share's link, embed code or download link copied (share id, kind,
 *                     mode, what was copied)
 * - share.open        a share link opened at /s/<id> (share id, kind, mode, host site)
 * - gallery.open      a visitor opened a Gallery item (slug, kind). Nothing
 *                     emits it, and the export reads the rows the table holds.
 * - studio.download   a Studio card's data saved to the device (format, card kind, card id, source)
 * - data.view         an embed the site served that draws DFO data (spec ids, content
 *                     versions, host site, the viewer's caller digest)
 * - page.view         a page shown, on first load and on each in-app navigation, sent
 *                     whatever the visitor's consent (the path, as `page`)
 *
 * Every event the site's pages send (BROWSER_EVENT_NAMES) from a signed-out
 * visitor is stored with its daily visitor key (`day_visitor`, see
 * ./dayVisitor), which the log line and PostHog do not get. A signed-in user's
 * events carry none, so no row holds a key beside a user id and a signed-out
 * visit cannot be tied to the account it signs in to later that day. share.open, embed.view, data.view and feedback.submit
 * carry none, since they are built to name no visitor or account and a key
 * shared with a signed-in user's events would link them to that account.
 *
 * Every event also carries `internal_eng`, true when the signed-in user's
 * email is verified and on the INTERNAL_ENG_EMAILS list (see ./internalEng).
 */
export const EVENT_NAMES = [
    'search.query',
    'search.empty',
    'search.edit',
    'search.error',
    'search.abandon',
    'search.action',
    'search.start_point',
    'search.studio_handoff',
    'studio.prompt',
    'studio.card',
    'studio.session_end',
    'auth.signin',
    'guest.wall_hit',
    'feedback.submit',
    'embed.view',
    'share.create',
    'share.copy',
    'share.open',
    'gallery.open',
    'studio.download',
    'data.view',
    'page.view',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export type EventProps = Record<string, unknown>;

/**
 * Who an event is about. `headers` are the incoming browser request's, for
 * the user agent and client address forwarded to PostHog (see ./posthog)
 * and keyed into a browser event's daily visitor key (see ./dayVisitor),
 * or null for an event with no browser request behind it. Required, so a
 * caller with a request cannot leave it out.
 */
export type Who = {
    userId?: string | null;
    /** The signed-in user's email and whether it is verified, from the caller's session
     *  (see `userWho`). INTERNAL_ENG_EMAILS matches a verified email only. */
    email?: string | null;
    emailVerified?: boolean | null;
    visitorId?: string | null;
    page?: string | null;
    headers: Headers | null;
};

/** The `Who` fields a session's user gives. */
export const userWho = (
    user: { id: string; email?: string | null; emailVerified?: boolean | null } | null | undefined,
): Pick<Who, 'userId' | 'email' | 'emailVerified'> => ({
    userId: user?.id ?? null,
    email: user?.email ?? null,
    emailVerified: user?.emailVerified ?? null,
});

const dayVisitor = dayVisitorResolver(db, trustedHops(process.env));

/**
 * Record one event. A failed insert or forward is logged by its error code
 * alone and swallowed, since the error's message lists the query's values, and each sink fails
 * independently of the others. The log line goes first and cannot throw, so
 * Cloud Logging has the event whether the insert or the forward fails. An
 * event whose request came from a crawler, link-preview fetcher or script
 * (isBotRequest) is not recorded anywhere, since no stored row or log line
 * keeps the user agent to tell it from a person's afterwards. A share id in
 * the page (/s/<id>, /embed/<id>) is written `:id` before any sink sees it.
 */
export const track = async (name: EventName, incoming: EventProps, given: Who) => {
    if (isBotRequest(given.headers)) {
        return;
    }

    const who: Who = { ...given, page: given.page ? redactSharePage(given.page) : null };

    // Set here, after the browser's own props, so a caller cannot claim it.
    // Read from INTERNAL_ENG_EMAILS at write time, so a list change reaches new events only.
    const props = withInternalEng(incoming, who, parseInternalEng(process.env.INTERNAL_ENG_EMAILS));

    logEvent(name, props, who);

    // One moment for the row's created_at and its visitor key, so a key always
    // belongs to its row's UTC day.
    const at = new Date();

    try {
        await db.insert(event).values({
            createdAt: at,
            name,
            props,
            userId: who.userId ?? null,
            visitorId: who.visitorId ?? null,
            dayVisitor:
                isBrowserEventName(name) && !who.userId ? await dayVisitor(who.headers, at) : null,
            page: who.page ?? null,
        });
    } catch (error) {
        console.warn('event not recorded', name, safeErrorCode(error));
    }

    if (posthogConfigured()) {
        try {
            await sendEventToPosthog(name, props, who);
        } catch (error) {
            console.warn('event not forwarded to PostHog', name, safeErrorCode(error));
        }
    }
};
