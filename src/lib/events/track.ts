import 'server-only';

import { db } from '@/lib/db';
import { event } from '../../../db/schema';
import { posthogConfigured, sendEventToPosthog } from './posthog';

/**
 * Usage events (the analytics in DFO Overview → Data access → "Events to
 * record"), stored in our own `event` table and, when POSTHOG_KEY and
 * POSTHOG_HOST are set, forwarded server-side to PostHog (EU cloud): no
 * cookies, no browser-side analytics script, no Studio prompt text. The
 * search events hold the first 500 characters of the query. The browser
 * posts its events through /api/events (see ./client); the server records
 * its own directly.
 *
 * Every name the site emits, so a typo can't fork the data:
 * - search.query      an answered search (spec ids, measures and filters, places,
 *                     window, StatVar and place counts)
 * - search.empty      a search the graph couldn't answer (the reasons)
 * - search.edit       an edit to a search answer, re-resolved (its outcome)
 * - search.error      a search post that failed (the error code)
 * - search.abandon    a search post left in flight (hidden, superseded or reset)
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
    visitorId?: string | null;
    page?: string | null;
    headers: Headers | null;
};

/**
 * Record one event. Fire-and-forget: analytics never cost a request, so a
 * failed insert or forward is logged and swallowed, and each sink fails
 * independently of the other.
 */
export const track = async (name: EventName, props: EventProps, who: Who) => {
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
