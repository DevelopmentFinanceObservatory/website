/**
 * The search API's Studio route on a Get Data run, and what the page does
 * with it. A raw-text submit opts in with `studio_routing: true`
 * (buildRequest); the API answers with a `route` object on the response and,
 * for `offer`, an early `route` stream frame. The page moves the reader to
 * Studio on `auto` and shows an inline Studio card on `offer`.
 */

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
 * only when Studio can answer on arrival: a guest with no free prompt left
 * (guestOutOfPrompts, src/lib/studio/promptAllowance.ts) would arrive at a
 * refusal, so is offered Studio instead. Every other route is an offer.
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
