'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { Widget } from '@/lib/chat/widgets';
import {
    isLiveDataCard,
    LIVE_CLIENT_CODES,
    type LiveCanvas,
    type LiveCardOutcome,
    type LiveCardState,
    type LiveDeps,
    refreshLiveCards,
    widgetFromLiveCard,
} from '@/lib/studio/liveCards';

const LOADING: LiveCardState = { status: 'loading' };

/** The refresh client's clock and `fetch` in a browser. */
export const browserLiveDeps: LiveDeps = {
    fetch: (...args) => fetch(...args),
    now: () => Date.now(),
};

// A settled card holds its state and the widget drawn from a `ready` answer.
type Settled = { state: LiveCardOutcome; widget?: Widget };

// An answer drawn onto its held card. A `ready` answer that draws nothing
// settles as an error.
const settledOf = (held: Widget | undefined, outcome: LiveCardOutcome): Settled => {
    if (outcome.status !== 'ready') {
        return { state: outcome };
    }

    const widget = held && widgetFromLiveCard(held, outcome.card);

    return widget
        ? { state: outcome, widget }
        : { state: { status: 'error', code: LIVE_CLIENT_CODES.unreadable } };
};

/**
 * The data cards of a live share, filled in the browser. `widgets` is the
 * canvas as the share page sent it, whose data cards are held (see
 * `sharedViewOf`). Each one is refreshed through
 * `GET /api/share/[id]/cards/[cardId]/refresh` and drawn as soon as its own
 * answer arrives.
 *
 * Returns the widgets to render, with every refreshed card drawn in place
 * of its held one, and the canvas's live state for the card components,
 * whose `retry` puts one failed card back to loading and asks for it again.
 * For a snapshot, or no share at all, it returns `widgets` itself and no
 * live state, and makes no request.
 */
export const useLiveCards = (
    share: { id: string; live?: boolean; createdAt?: string } | undefined,
    widgets: Widget[],
): { widgets: Widget[]; live: LiveCanvas | undefined } => {
    const shareId = share?.live ? share.id : null;
    const [settled, setSettled] = useState<Record<string, Settled>>({});
    const cardIds = shareId ? widgets.filter(isLiveDataCard).map((widget) => widget.id) : [];
    // The effect follows which cards are on the canvas, not the array's
    // identity, which changes on every render.
    const cardKey = JSON.stringify(cardIds);
    // The canvas's requests, a retry's included, stop with one signal.
    const signalRef = useRef<AbortSignal | null>(null);

    const settle = useEffectEvent((cardId: string, outcome: LiveCardOutcome) => {
        const held = widgets.find((widget) => widget.id === cardId);

        setSettled((prev) => ({ ...prev, [cardId]: settledOf(held, outcome) }));
    });

    useEffect(() => {
        if (!shareId) {
            return;
        }

        const controller = new AbortController();

        signalRef.current = controller.signal;

        void refreshLiveCards(browserLiveDeps, {
            shareId,
            cardIds: JSON.parse(cardKey) as string[],
            signal: controller.signal,
            onSettled: settle,
        });

        return () => controller.abort();
    }, [shareId, cardKey]);

    if (!shareId) {
        return { widgets, live: undefined };
    }

    const retry = (cardId: string) => {
        const signal = signalRef.current;

        if (!signal || signal.aborted || settled[cardId]?.state.status !== 'error') {
            return;
        }

        const held = widgets.find((widget) => widget.id === cardId);

        setSettled((prev) =>
            Object.fromEntries(Object.entries(prev).filter(([id]) => id !== cardId)),
        );
        void refreshLiveCards(browserLiveDeps, {
            shareId,
            cardIds: [cardId],
            signal,
            onSettled: (id, outcome) =>
                setSettled((prev) => ({ ...prev, [id]: settledOf(held, outcome) })),
        });
    };

    return {
        widgets: widgets.map((widget) => settled[widget.id]?.widget ?? widget),
        live: {
            shareId,
            createdAt: share?.createdAt,
            states: Object.fromEntries(
                cardIds.map((cardId) => [cardId, settled[cardId]?.state ?? LOADING]),
            ),
            retry,
        },
    };
};
