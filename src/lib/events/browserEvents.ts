// The browser's event names, in their own module (no db or server-only
// imports) so src/lib/test/events-browser.test.ts can run it under plain node.

import type { EventName } from './track.ts';

/**
 * The names the site's own pages send through POST /api/events
 * (src/lib/events/client.ts). The route refuses every other name, so an
 * event the server records itself cannot arrive through it with unchecked
 * props.
 */
export const BROWSER_EVENT_NAMES = [
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
    'studio.download',
    'guest.wall_hit',
    'gallery.open',
] as const satisfies readonly EventName[];

export type BrowserEventName = (typeof BROWSER_EVENT_NAMES)[number];

export const isBrowserEventName = (name: unknown): name is BrowserEventName =>
    (BROWSER_EVENT_NAMES as readonly unknown[]).includes(name);
