'use client';

import { useCallback, useState } from 'react';

import type { CardView } from '../canvas/layout';
import type { TurnWidget } from './useChat';

import { canvasWidgetsOf } from '@/lib/chat/canvas';
import type { SavedConversation, ShareMark } from '@/lib/chat/history';
import type { TextWidget, Widget } from '@/lib/chat/widgets';
import { renameId, renameKey } from '@/lib/studio/cardReplace';
import {
    type CanvasBaseline,
    type CardMarks,
    withLocalCards,
    withManifestPins,
} from '@/lib/studio/composition';
import { DEFAULT_THEME, type StudioTheme } from '@/lib/studio/theme';
import { uuid } from '@/lib/uuid';

/**
 * Everything on the canvas that ISN'T the chat: which cards are pinned or
 * removed, per-card views / titles / notes, the user's text cards, the
 * theme, the conversation's title and its share points. Saved with the
 * conversation; reset for a new one; loaded from a saved one. Which harness
 * cards the canvas shows is the harness manifest's (canvasWidgetsOf).
 */
export const useCanvasDocument = (initial?: SavedConversation) => {
    // Pinned cards (`pinnedIds`): the harness keeps them when the model
    // clears the canvas. The cards the harness never held (`localIds`), such
    // as a fork's inherited cards. The cards of those and the text cards that
    // the user took off the canvas (`removedIds`); the harness's manifest
    // decides for its own.
    const [marks, setMarks] = useState<CardMarks>({
        pinnedIds: initial?.pinnedIds ?? [],
        removedIds: initial?.removedIds ?? [],
        localIds: initial?.localIds ?? [],
    });
    const { pinnedIds, removedIds, localIds } = marks;
    // A save from before the manifest decided the canvas keeps the grace set
    // its canvas was drawn with, as loaded (legacyCanvasWidgetsOf).
    const [grace, setGrace] = useState<{ ids: string[]; turn: number }>({
        ids: initial?.graceIds ?? [],
        turn: initial?.graceTurn ?? 0,
    });
    // Per-card visualisation from the kebab switcher (chart↔table↔line) —
    // drives the filters/tabs and is saved with the conversation.
    const [views, setViews] = useState<Record<string, CardView>>(initial?.views ?? {});
    // The plot ratio a card's dragged height set (ChartCard), by widget id —
    // saved with the conversation, like the view.
    const [ratios, setRatios] = useState<Record<string, number>>(initial?.ratios ?? {});
    // User-authored text cards (Add Text Card) — local, turn-independent,
    // they stay on the canvas until removed.
    const [textCards, setTextCards] = useState<TextWidget[]>(initial?.textCards ?? []);
    // Renamed card titles (menu → Edit Title) and user notes (menu → Add
    // Note), by widget id.
    const [titles, setTitles] = useState<Record<string, string>>(initial?.titles ?? {});
    const [notes, setNotes] = useState<Record<string, string>>(initial?.notes ?? {});
    // Canvas theme (Customize drawer) — per conversation.
    const [theme, setTheme] = useState<StudioTheme>(initial?.theme ?? DEFAULT_THEME);
    // The conversation's title (header): the first prompt by default, or a
    // user rename (header pencil → Edit Title).
    const [conversationTitle, setConversationTitle] = useState<string | null>(
        initial?.title ?? null,
    );
    // Chat + Canvas share points (see ShareMark).
    const [shareMarks, setShareMarks] = useState<ShareMark[]>([]);
    // Cards that replaced another in its slot, new id → old id: the canvas
    // moves the old card's place and size to the new one.
    const [replacedIds, setReplacedIds] = useState<Record<string, string>>({});

    // A fresh canvas (a new prompt from the landing).
    const reset = useCallback(() => {
        setMarks({ pinnedIds: [], removedIds: [], localIds: [] });
        setGrace({ ids: [], turn: 0 });
        setViews({});
        setRatios({});
        setTextCards([]);
        setTitles({});
        setNotes({});
        setTheme(DEFAULT_THEME);
        setConversationTitle(null);
        setShareMarks([]);
        setReplacedIds({});
    }, []);

    // A saved conversation, exactly as it was left.
    const load = useCallback((saved: SavedConversation) => {
        setMarks({
            pinnedIds: saved.pinnedIds,
            removedIds: saved.removedIds,
            localIds: saved.localIds ?? [],
        });
        setGrace({ ids: saved.graceIds ?? [], turn: saved.graceTurn ?? 0 });
        setViews(saved.views ?? {});
        setRatios(saved.ratios ?? {});
        setTextCards(saved.textCards ?? []);
        setTitles(saved.titles ?? {});
        setNotes(saved.notes ?? {});
        setTheme(saved.theme ?? DEFAULT_THEME);
        // The saved title IS the display title (a rename or the first prompt).
        setConversationTitle(saved.title);
        setShareMarks(saved.shareMarks ?? []);
        setReplacedIds({});
    }, []);

    const setPinnedIds = useCallback(
        (update: (prev: string[]) => string[]) =>
            setMarks((prev) => {
                const next = update(prev.pinnedIds);

                return next === prev.pinnedIds ? prev : { ...prev, pinnedIds: next };
            }),
        [],
    );

    const setRemovedIds = useCallback(
        (update: (prev: string[]) => string[]) =>
            setMarks((prev) => {
                const next = update(prev.removedIds);

                return next === prev.removedIds ? prev : { ...prev, removedIds: next };
            }),
        [],
    );

    const togglePin = useCallback(
        (id: string) =>
            setPinnedIds((prev) =>
                prev.includes(id) ? prev.filter((other) => other !== id) : [...prev, id],
            ),
        [setPinnedIds],
    );

    // Cards the harness turned out never to hold (useChat's localCards):
    // `shown` ones stay on the canvas and `hidden` ones go off it.
    const addLocalIds = useCallback(
        (shown: readonly string[], hidden: readonly string[] = []) =>
            setMarks((prev) => withLocalCards(prev, shown, hidden)),
        [],
    );

    // The harness cards' pins as the harness's manifest has them, with the
    // pins of the cards only the page holds kept. Which cards those are is
    // read from the state this update writes, so local cards added earlier
    // in the same render keep their pins.
    const takeHarnessPins = useCallback(
        (pins: readonly string[], widgets: readonly { id: string }[]) =>
            setMarks((prev) => withManifestPins(prev, pins, widgets)),
        [],
    );

    const unpin = useCallback(
        (id: string) => setPinnedIds((prev) => prev.filter((other) => other !== id)),
        [setPinnedIds],
    );

    // A card the harness redrew under a new id (see cardReplace): its pin,
    // grace, removal, view, ratio, title and note move to the new id.
    const renameWidget = useCallback(
        (from: string, to: string) => {
            setPinnedIds((prev) => renameId(prev, from, to));
            setRemovedIds((prev) => renameId(prev, from, to));
            setGrace((prev) => {
                const ids = renameId(prev.ids, from, to);

                return ids === prev.ids ? prev : { ...prev, ids };
            });
            setViews((prev) => renameKey(prev, from, to));
            setRatios((prev) => renameKey(prev, from, to));
            setTitles((prev) => renameKey(prev, from, to));
            setNotes((prev) => renameKey(prev, from, to));
            setReplacedIds((prev) => ({ ...prev, [to]: from }));
        },
        [setPinnedIds, setRemovedIds],
    );

    // A local card off the canvas (card menu → Remove).
    const removeWidget = useCallback(
        (id: string) => {
            setRemovedIds((prev) => [...prev, id]);
            unpin(id);
        },
        [setRemovedIds, unpin],
    );

    // Chat chip → Add: a removed local card is un-removed.
    const addWidget = useCallback(
        (id: string) => setRemovedIds((prev) => prev.filter((other) => other !== id)),
        [setRemovedIds],
    );

    // Add or edit a text card (an empty title falls back to "Text Card").
    const upsertTextCard = useCallback((id: string | null, title: string, body: string) => {
        const safeTitle = title || 'Text Card';

        setTextCards((prev) =>
            id
                ? prev.map((card) => (card.id === id ? { ...card, title: safeTitle, body } : card))
                : [...prev, { kind: 'text', id: `text-${uuid()}`, title: safeTitle, body }],
        );
    }, []);

    const setView = useCallback(
        (id: string, view: CardView) => setViews((prev) => ({ ...prev, [id]: view })),
        [],
    );

    const setRatio = useCallback(
        (id: string, ratio: number) => setRatios((prev) => ({ ...prev, [id]: ratio })),
        [],
    );

    const setTitle = useCallback(
        (id: string, title: string) => setTitles((prev) => ({ ...prev, [id]: title })),
        [],
    );

    const setNote = useCallback(
        (id: string, note: string) => setNotes((prev) => ({ ...prev, [id]: note })),
        [],
    );

    const removeNote = useCallback(
        (id: string) =>
            setNotes((prev) => {
                const next = { ...prev };

                delete next[id];

                return next;
            }),
        [],
    );

    const addShareMark = useCallback(
        (mark: ShareMark) => setShareMarks((prev) => [...prev, mark]),
        [],
    );

    // What the canvas shows, through the same rule a share's live checks
    // use, from the harness canvas the chat last saw.
    const visibleWidgets = useCallback(
        (chatWidgets: TurnWidget[], canvas: CanvasBaseline | null): Widget[] =>
            canvasWidgetsOf({
                widgets: chatWidgets,
                canvas,
                localIds,
                pinnedIds,
                removedIds,
                graceIds: grace.ids,
                graceTurn: grace.turn,
                textCards,
            }),
        [localIds, pinnedIds, removedIds, grace, textCards],
    );

    return {
        pinnedIds,
        removedIds,
        localIds,
        graceIds: grace.ids,
        graceTurn: grace.turn,
        views,
        ratios,
        textCards,
        titles,
        notes,
        theme,
        conversationTitle,
        shareMarks,
        replacedIds,
        setTheme,
        setConversationTitle,
        reset,
        load,
        togglePin,
        takeHarnessPins,
        addLocalIds,
        unpin,
        removeWidget,
        renameWidget,
        addWidget,
        upsertTextCard,
        setView,
        setRatio,
        setTitle,
        setNote,
        removeNote,
        addShareMark,
        visibleWidgets,
    };
};

export type CanvasDocument = ReturnType<typeof useCanvasDocument>;
