import 'server-only';

import { db } from '@/lib/db';
import { event } from '../../../db/schema';

/**
 * Usage events (the analytics in DFO Overview → Data access → "Events to
 * record"), stored in our own `event` table — first-party, no cookies, no
 * third party, no prompt text. The browser posts its events through
 * /api/events (see ./client); the server records its own directly.
 *
 * Every name the site emits, so a typo can't fork the data:
 * - search.query      an answered search (spec ids, measures and filters, places,
 *                     window, StatVar and place counts)
 * - search.empty      a search the graph couldn't answer (the reasons)
 * - search.studio_handoff  a Studio action on a search answer
 * - studio.prompt     a prompt sent in the Studio (turn, intent — not the text)
 * - studio.card       a card the harness put on the canvas (kind, indicators…)
 * - studio.session_end  a Studio session left (turns, cards, pins)
 * - auth.signin       a sign-in (provider)
 * - guest.wall_hit    a guest ran out of free prompts
 * - feedback.submit   a feedback sent (kind)
 * - embed.view        an embed loaded in an iframe (share id, kind, host site)
 */
export const EVENT_NAMES = [
    'search.query',
    'search.empty',
    'search.studio_handoff',
    'studio.prompt',
    'studio.card',
    'studio.session_end',
    'auth.signin',
    'guest.wall_hit',
    'feedback.submit',
    'embed.view',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export type EventProps = Record<string, unknown>;

type Who = {
    userId?: string | null;
    visitorId?: string | null;
    page?: string | null;
};

/**
 * Record one event. Fire-and-forget: analytics never cost a request, so a
 * failed insert is logged and swallowed.
 */
export const track = async (name: EventName, props: EventProps = {}, who: Who = {}) => {
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
};
