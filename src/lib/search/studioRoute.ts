/**
 * The search API's Studio route on a Get Data run, and what the page does
 * with it. A raw-text submit opts in with `studio_routing: true`
 * (buildRequest); the API answers with a `route` object on the response and,
 * for `offer`, an early `route` stream frame. The page moves the reader to
 * Studio on `auto` and shows an inline Studio card on `offer`.
 */

import { guestPromptsUsed } from '../studio/promptAllowance.ts';

import type { ResolveResponse, StudioRoute } from './types.ts';

/** `value` as a Studio route, or null when it is not one this release reads:
 *  a missing object, another target, an unknown mode, or a probability
 *  outside 0 to 1. A route the page cannot read is ignored, so the run
 *  shows its answer as it would without one. */
export function studioRoute(value: unknown): StudioRoute | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const { target, mode, probability } = value as Record<string, unknown>;

    if (target !== 'studio' || (mode !== 'auto' && mode !== 'offer')) {
        return null;
    }

    if (
        probability != null &&
        (typeof probability !== 'number' || !(probability >= 0 && probability <= 1))
    ) {
        return null;
    }

    return { target, mode, probability: probability ?? null };
}

/** What the page does with a route: move the reader to Studio, or offer it. */
export type RouteMove = 'auto' | 'offer';

/**
 * The page's move for a run's route, or null for none. `auto` moves the
 * reader only on the `declined` answer the API ends an auto run with, and
 * only while a guest has a free prompt left: a guest with none
 * (guestOutOfPrompts, src/lib/studio/promptAllowance.ts) would arrive at a
 * refusal, so is offered Studio instead. A signed-in reader is moved
 * whatever their daily allowance. Every other route is an offer.
 */
export function routeMove({
    route,
    kind,
    guestOutOfPrompts,
}: {
    route: StudioRoute | null;
    kind: ResolveResponse['kind'] | null;
    guestOutOfPrompts: boolean;
}): RouteMove | null {
    if (!route) {
        return null;
    }

    return route.mode === 'auto' && kind === 'declined' && !guestOutOfPrompts ? 'auto' : 'offer';
}

/**
 * Whether a click leaves the page in this tab: a plain primary click (no
 * modifier key) on a link that opens in this tab and points at another
 * page, by origin or path. The automatic move reads one during its pause as
 * the reader leaving, and stops the move without staying. `link` is the
 * clicked `a[href]` (its resolved `href` and its `target`), or null.
 */
export function clickLeavesPage(
    click: Pick<MouseEvent, 'button' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
    link: { href: string; target: string } | null,
    here: string,
): boolean {
    if (
        !link ||
        click.button !== 0 ||
        click.altKey ||
        click.ctrlKey ||
        click.metaKey ||
        click.shiftKey ||
        (link.target !== '' && link.target !== '_self')
    ) {
        return false;
    }

    let to: URL;

    try {
        to = new URL(link.href, here);
    } catch {
        return false;
    }

    const from = new URL(here);

    return to.origin !== from.origin || to.pathname !== from.pathname;
}

/** The guest prompt count the move reads: 0 for a signed-in reader, whose
 *  storage is left unread, and 0 when the browser blocks storage, since
 *  the proxy still meters the guest's allowance. */
export function guestPromptsSeen({
    guest,
    storage,
}: {
    guest: boolean;
    storage: () => Pick<Storage, 'getItem'>;
}): number {
    if (!guest) {
        return 0;
    }

    try {
        return guestPromptsUsed(storage());
    } catch {
        return 0;
    }
}

/** Whether /data treats the visitor as a guest: no session, or a session
 *  read that failed, so the page still renders when auth is down. */
export async function visitorIsGuest(readSession: () => Promise<unknown>): Promise<boolean> {
    try {
        return !(await readSession());
    } catch (error) {
        console.error('data: the session read failed, so the page renders for a guest', error);

        return true;
    }
}
