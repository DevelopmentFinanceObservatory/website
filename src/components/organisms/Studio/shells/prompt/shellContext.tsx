import {
    createContext,
    type Dispatch,
    type ReactNode,
    type RefObject,
    useCallback,
    useContext,
    useEffect,
    useEffectEvent,
    useMemo,
    useReducer,
    useRef,
    useState,
} from 'react';

import { useStudioModel } from '../../hooks/studioContext';
import styles from './PromptShell.module.scss';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { trackLayout } from '@/lib/events/client';
import type { LayoutEventName, LayoutMembers } from '@/lib/events/studioLayoutEvents';
import { type PlanLinks, planLinks } from '@/lib/studio/planLink';
import {
    heldCard,
    initialShell,
    PANEL_OVERLAY_BELOW,
    panelShows,
    type ShellAction,
    type ShellState,
    shellReducer,
} from '@/lib/studio/promptShell';

/** Returns true when it handled the key. */
export type EscapeHandler = (event: KeyboardEvent) => boolean;

type EscapeEntry = { order: number; handler: RefObject<EscapeHandler> };

export type PromptShellValue = {
    state: ShellState;
    dispatch: Dispatch<ShellAction>;
    /** Whether the session panel shows (panelShows over the canvas's cards). */
    panelOpen: boolean;
    /** The card whose page is on top of the panel's trail. */
    heldCard: string | null;
    /** Below PANEL_OVERLAY_BELOW: the panel overlays the canvas and opens
     *  only when asked. */
    overlay: boolean;
    /** The shell's root element. The dock writes its heights on it as
     *  `--dock-rest` and `--dock-current` (px). */
    rootRef: RefObject<HTMLElement | null>;
    /** The session panel's frame (the shell's `aside`). */
    panelRef: RefObject<HTMLElement | null>;
    /** Puts the caret in the dock's field, leaving focus mode first. */
    focusField: () => void;
    /** The dock hands over its field (null when it unmounts). */
    registerField: (field: HTMLElement | null) => void;
    /** Puts focus on a card's selection toggle on the canvas; false when the
     *  card is not on the canvas. */
    focusCard: (id: string) => boolean;
    /** The approved plans and their cards on the canvas (planLinks), for
     *  the canvas, the panel and the card page. */
    plans: PlanLinks;
    /** Speaks `text` through the shell's polite live region, or through its
     *  alert region for an `error`. */
    announce: (text: string, kind?: 'error') => void;
    /** Records a usage event for a reader's action on the layout's own
     *  controls (STUDIO_LAYOUT_EVENTS), with the Studio's variant. */
    report: <N extends LayoutEventName>(name: N, members: LayoutMembers<N>) => void;
};

const ShellContext = createContext<PromptShellValue | null>(null);

export const usePromptShell = (): PromptShellValue => {
    const value = useContext(ShellContext);

    if (!value) {
        throw new Error('usePromptShell needs a PromptShellProvider above it');
    }

    return value;
};

const EscapeContext = createContext<RefObject<Set<EscapeEntry>> | null>(null);

/**
 * Registers an Escape handler while `active` is true, which each caller
 * sets to whether its region is on screen. The shell calls the highest
 * order first (the ESCAPE_* constants in promptShell.ts) and stops at the
 * first handler that returns true.
 */
export const useEscape = (order: number, handler: EscapeHandler, active = true) => {
    const entries = useContext(EscapeContext);
    const latest = useRef(handler);

    if (!entries) {
        throw new Error('useEscape needs a PromptShellProvider above it');
    }

    useEffect(() => {
        latest.current = handler;
    });

    useEffect(() => {
        if (!active) return;

        const entry: EscapeEntry = { order, handler: latest };
        const all = entries.current;

        all.add(entry);

        return () => {
            all.delete(entry);
        };
    }, [entries, order, active]);
};

const TEXT_FIELD =
    'input:not([type="button"], [type="checkbox"], [type="radio"]), textarea, select, [contenteditable="true"]';
// Things that close themselves on Escape: an open menu, a modal dialog, the
// feedback widget.
const OWN_ESCAPE =
    '[role="menu"], [role="dialog"][aria-modal="true"], dialog[open], [data-feedback-widget]';

/**
 * Whether an Escape aimed at `target` belongs to something outside the
 * shell's order: a menu, a modal dialog, the feedback widget, or a text
 * field outside the shell's regions (`regions`).
 */
const escapeElsewhere = (
    target: EventTarget | null,
    regions: readonly (Element | null)[],
): boolean => {
    if (!(target instanceof Element)) return false;
    if (target.closest(OWN_ESCAPE)) return true;

    return (
        target.matches(TEXT_FIELD) && !regions.some((region) => region?.contains(target) ?? false)
    );
};

/**
 * The Prompt layout's shell state (promptShell.ts), the one Escape listener,
 * the live regions (one polite, one for errors), and the plan links. Shell state resets with
 * the session: whenever the Studio returns to its landing.
 */
export const PromptShellProvider = ({ children }: { children: ReactNode }) => {
    const model = useStudioModel();
    const [state, dispatch] = useReducer(shellReducer, initialShell);
    const rootRef = useRef<HTMLElement | null>(null);
    const panelRef = useRef<HTMLElement | null>(null);
    const escapes = useRef(new Set<EscapeEntry>());
    const live = useRef<HTMLParagraphElement | null>(null);
    const alert = useRef<HTMLParagraphElement | null>(null);
    const mode = model.mode.current;
    const [seenMode, setSeenMode] = useState(mode);

    // New Session and opening another conversation both pass through the
    // landing, so the shell resets there.
    if (seenMode !== mode) {
        setSeenMode(mode);

        if (mode === 'start') {
            dispatch({ type: 'session.reset' });
        }
    }

    // A new question: a prompt that is neither an answer to a paused turn
    // nor a card change.
    const asked = model.chat.messages.filter(
        (message) => message.role === 'user' && !message.answer && !message.edit,
    );
    const questions = asked.length;
    const newest = asked.at(-1);
    const aboutCard = newest?.role === 'user' && newest.card !== undefined;
    const [seenQuestions, setSeenQuestions] = useState(questions);

    if (seenQuestions !== questions) {
        setSeenQuestions(questions);

        if (questions > seenQuestions) {
            dispatch({ type: 'question.sent' });
        }
    }

    // A new question clears the canvas selection. A question about the
    // selected card leaves it to the dock, which clears it on sending.
    const { setEditTarget } = model.drafts;
    const counted = useRef(questions);

    useEffect(() => {
        if (questions > counted.current && !aboutCard) {
            setEditTarget(null);
        }

        counted.current = questions;
    }, [questions, aboutCard, setEditTarget]);

    const overlay = useMediaQuery(`(max-width: ${PANEL_OVERLAY_BELOW - 1}px)`);

    const onKey = useEffectEvent((event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;

        const regions = [
            rootRef.current?.querySelector('[data-studio-canvas]') ?? null,
            panelRef.current,
        ];

        if (escapeElsewhere(event.target, regions)) return;

        const ordered = [...escapes.current].toSorted((a, b) => b.order - a.order);

        for (const entry of ordered) {
            if (entry.handler.current(event)) {
                // Later listeners see the key as taken; it still propagates.
                event.preventDefault();

                return;
            }
        }
    });

    const field = useRef<HTMLElement | null>(null);
    const registerField = useCallback((node: HTMLElement | null) => {
        field.current = node;
    }, []);
    const focusField = useCallback(() => {
        dispatch({ type: 'focus.set', on: false });
        // The dock's box is inert in focus mode, so the caret waits a frame
        // for it to come back.
        requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    }, []);
    const focusCard = useCallback((id: string) => {
        const toggle = rootRef.current?.querySelector<HTMLElement>(
            `[data-studio-canvas] [data-card-id="${CSS.escape(id)}"] [data-card-select]`,
        );

        toggle?.focus({ preventScroll: true });

        return toggle !== null && toggle !== undefined;
    }, []);

    useEffect(() => {
        const listener = (event: KeyboardEvent) => onKey(event);

        document.addEventListener('keydown', listener);

        return () => document.removeEventListener('keydown', listener);
    }, []);

    const frame = useRef(0);
    const announce = useCallback((text: string, kind?: 'error') => {
        const node = kind === 'error' ? alert.current : live.current;

        if (!node) return;

        // Emptied first and written a frame later, so repeated words are
        // announced again.
        node.textContent = '';
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            node.textContent = text;
        });
    }, []);

    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    const { variant } = model;
    const report = useCallback(
        <N extends LayoutEventName>(name: N, members: LayoutMembers<N>) =>
            trackLayout(name, { ...members, variant }),
        [variant],
    );

    const { messages, widgets: turnWidgets, activity } = model.chat;
    const replaced = model.doc.replacedIds;
    // The canvas's widget list is a new array each render; its ids are not.
    const canvasKey = model.canvas.widgets.map((widget) => widget.id).join('\n');
    const plans = useMemo(() => {
        const shown = new Set(canvasKey.split('\n'));

        return planLinks({
            messages,
            widgets: turnWidgets,
            activity,
            replaced,
            visible: (id) => shown.has(id),
        });
    }, [messages, turnWidgets, activity, replaced, canvasKey]);

    const cardCount = model.canvas.widgets.length;
    const value = useMemo<PromptShellValue>(
        () => ({
            state,
            dispatch,
            panelOpen: panelShows(state, cardCount, overlay),
            heldCard: heldCard(state),
            overlay,
            rootRef,
            panelRef,
            focusField,
            registerField,
            focusCard,
            plans,
            announce,
            report,
        }),
        [state, cardCount, overlay, plans, focusField, registerField, focusCard, announce, report],
    );

    return (
        <EscapeContext.Provider value={escapes}>
            <ShellContext.Provider value={value}>
                {children}
                <p ref={live} className={styles.live} aria-live="polite" />
                <p ref={alert} className={styles.live} role="alert" />
            </ShellContext.Provider>
        </EscapeContext.Provider>
    );
};
