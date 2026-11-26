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

/** The dock's heights in px: at rest, and as drawn now (a sheet open). */
export type DockBand = { rest: number; current: number };

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
    /** Written by the dock; the shell root carries the same numbers as
     *  `--dock-rest` and `--dock-current`. */
    dockBand: RefObject<DockBand>;
    /** Below PANEL_OVERLAY_BELOW: the panel overlays the canvas and opens
     *  only when asked. */
    overlay: boolean;
    /** The shell's root element. */
    rootRef: RefObject<HTMLElement | null>;
    /** The session panel's frame (the shell's `aside`), where the panel
     *  sets its `data-sp-*` attributes. */
    panelRef: RefObject<HTMLElement | null>;
    /** Registers an Escape handler while the calling component is mounted.
     *  The shell calls the highest order first (the ESCAPE_* constants in
     *  promptShell.ts) and stops at the first that returns true. */
    useEscape: (order: number, handler: EscapeHandler) => void;
    /** The approved plans and their cards on the canvas (planLinks), for
     *  the canvas, the panel and the card page. */
    plans: PlanLinks;
    /** Speaks `text` through the shell's polite live region. */
    announce: (text: string) => void;
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
 * Registers an Escape handler while the calling component is mounted; also
 * returned by usePromptShell. The shell calls the highest order first and
 * stops at the first handler that returns true.
 */
export const useEscape = (order: number, handler: EscapeHandler) => {
    const entries = useContext(EscapeContext);
    const latest = useRef(handler);

    if (!entries) {
        throw new Error('useEscape needs a PromptShellProvider above it');
    }

    useEffect(() => {
        latest.current = handler;
    });

    useEffect(() => {
        const entry: EscapeEntry = { order, handler: latest };
        const all = entries.current;

        all.add(entry);

        return () => {
            all.delete(entry);
        };
    }, [entries, order]);
};

/**
 * The Prompt layout's shell state (promptShell.ts), the one Escape listener,
 * the one polite live region, and the dock's band. Shell state resets with
 * the session: whenever the Studio returns to its landing.
 */
export const PromptShellProvider = ({ children }: { children: ReactNode }) => {
    const model = useStudioModel();
    const [state, dispatch] = useReducer(shellReducer, initialShell);
    const dockBand = useRef<DockBand>({ rest: 0, current: 0 });
    const rootRef = useRef<HTMLElement | null>(null);
    const panelRef = useRef<HTMLElement | null>(null);
    const escapes = useRef(new Set<EscapeEntry>());
    const live = useRef<HTMLParagraphElement | null>(null);
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

        const ordered = [...escapes.current].toSorted((a, b) => b.order - a.order);

        for (const entry of ordered) {
            if (entry.handler.current(event)) {
                event.preventDefault();
                event.stopPropagation();

                return;
            }
        }
    });

    useEffect(() => {
        const listener = (event: KeyboardEvent) => onKey(event);

        document.addEventListener('keydown', listener);

        return () => document.removeEventListener('keydown', listener);
    }, []);

    const frame = useRef(0);
    const announce = useCallback((text: string) => {
        const node = live.current;

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

    const { messages, widgets: turnWidgets, activity } = model.chat;
    const onCanvas = model.canvas.widgets;
    const replaced = model.doc.replacedIds;
    const plans = useMemo(() => {
        const shown = new Set(onCanvas.map((widget) => widget.id));

        return planLinks({
            messages,
            widgets: turnWidgets,
            activity,
            replaced,
            visible: (id) => shown.has(id),
        });
    }, [messages, turnWidgets, activity, replaced, onCanvas]);

    const cardCount = model.canvas.widgets.length;
    const value = useMemo<PromptShellValue>(
        () => ({
            state,
            dispatch,
            panelOpen: panelShows(state, cardCount, overlay),
            heldCard: heldCard(state),
            dockBand,
            overlay,
            rootRef,
            panelRef,
            useEscape,
            plans,
            announce,
        }),
        [state, cardCount, overlay, plans, announce],
    );

    return (
        <EscapeContext.Provider value={escapes}>
            <ShellContext.Provider value={value}>
                {children}
                <p ref={live} className={styles.live} aria-live="polite" />
            </ShellContext.Provider>
        </EscapeContext.Provider>
    );
};
