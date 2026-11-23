import 'server-only';

import { isBotRequest } from '@/lib/bot';
import { db } from '@/lib/db';
import { event } from '../../../db/schema';
import { logEvent } from './eventLog';
import { parseInternalEng, withInternalEng } from './internalEng';
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
 * - gallery.open      a visitor opened a Gallery item (slug, kind)
 * - studio.download   a Studio card's data saved to the device (format, card kind, card id, source)
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
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export type EventProps = Record<string, unknown>;

/**
 * Who an event is about. `headers` are the incoming browser request's, for
 * the user agent and client address forwarded to PostHog (see ./posthog),
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

/**
 * Record one event. Fire-and-forget: analytics never cost a request, so a
 * failed insert or forward is logged and swallowed, and each sink fails
 * independently of the others. The log line goes first and cannot throw, so
 * Cloud Logging has the event whether the insert or the forward fails. An
 * event whose request came from a crawler, link-preview fetcher or script
 * (isBotRequest) is not recorded anywhere, since no stored row or log line
 * keeps the user agent to tell it from a person's afterwards.
 */
export const track = async (name: EventName, incoming: EventProps, who: Who) => {
    if (isBotRequest(who.headers)) {
        return;
    }

    // Set here, after the browser's own props, so a caller cannot claim it.
    // Read from INTERNAL_ENG_EMAILS at write time, so a list change reaches new events only.
    const props = withInternalEng(incoming, who, parseInternalEng(process.env.INTERNAL_ENG_EMAILS));

    logEvent(name, props, who);

    try {
        await db.insert(event).values({
            name,
            props,
            userId: who.userId ?? null,
            visitorId: who.visitorId ?? null,
            page: who.page ?? null,
        });
    } catch (error) {
        console.warn('event not recorded', name, error);
    }

    if (posthogConfigured()) {
        try {
            await sendEventToPosthog(name, props, who);
        } catch (error) {
            console.warn('event not forwarded to PostHog', name, error);
        }
    }
};
