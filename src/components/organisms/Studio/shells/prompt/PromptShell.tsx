import classNames from 'classnames';
import {
    type CSSProperties,
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';

import Whiteboard, { type PromptCanvas } from '../../canvas/Whiteboard';
import GuestWall from '../../GuestWall';
import { useStudioModel } from '../../hooks/studioContext';
import StudioLanding from '../../landing/StudioLanding';
import StudioModals from '../../modals/StudioModals';
import studioStyles from '../../Studio.module.scss';
import CanvasBackdrop from '../CanvasBackdrop';
import DownloadDataModal from '../DownloadDataModal';
import { whiteboardProps } from '../whiteboardProps';
import PromptDock from './dock/PromptDock';
import SessionPanel from './panel/SessionPanel';
import styles from './PromptShell.module.scss';
import { PromptShellProvider, useEscape, usePromptShell } from './shellContext';
import { PANEL_ID, TopBarTitle, TopBarTools } from './TopBar';

import Button from '@/components/atoms/Button/Button';
import FeedbackWidget from '@/components/organisms/FeedbackWidget/FeedbackWidget';
import Header from '@/components/organisms/Header/Header';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
    dockArrival,
    ESCAPE_OVERLAY_PANEL,
    litCards,
    PANEL_WIDTH,
    SHELL_GUTTER,
} from '@/lib/studio/promptShell';
import { themeVars } from '@/lib/studio/theme';

// The landing prompt's move into the dock: 0.9 s after 0.1 s (--ws-dur and
// --ws-delay), with a margin for the transition's own end event.
const TRAVEL_MS = 1100;

// The longest wait for the landed copy's fade to end (.travel[data-fading]).
const FADE_MAX_MS = 300;

/** A CSS time (`0.9s`, `100ms`) in ms. */
const cssMs = (value: string): number => {
    const time = value.trim();

    return time.endsWith('ms') ? parseFloat(time) : parseFloat(time) * 1000;
};

/** Px per design px: rem() scales with the root font. */
const designUnit = () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;

const useDesignUnit = () =>
    useSyncExternalStore(
        (onChange) => {
            window.addEventListener('resize', onChange);

            return () => window.removeEventListener('resize', onChange);
        },
        designUnit,
        () => 1,
    );

type Rect = { left: number; top: number; width: number; height: number };

const place = (node: HTMLElement, rect: Rect) => {
    node.style.left = `${rect.left}px`;
    node.style.top = `${rect.top}px`;
    node.style.width = `${rect.width}px`;
    node.style.height = `${rect.height}px`;
};

/** The dock's resting box with the panel open (beside the canvas) or not. */
const arrival = (besidePanel: boolean): Rect => {
    const unit = designUnit();

    return dockArrival({
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
        panelSpace: (besidePanel ? PANEL_WIDTH + 2 * SHELL_GUTTER : SHELL_GUTTER) * unit,
        unit,
    });
};

/**
 * A copy of the landing's prompt that travels from its place to the dock's
 * box while the landing leaves. The dock is laid out, hidden, from the start
 * of the move, so the copy heads for the box it lands on from its first
 * frame. At TRAVEL_MS the dock shows (`onLanded`) and the copy fades away
 * over it (`onDone` once gone).
 */
const LandingTravel = ({ onLanded, onDone }: { onLanded: () => void; onDone: () => void }) => {
    const { query, inputRef } = useStudioModel().drafts;
    // The question as it left the landing.
    const [text] = useState(query);
    const { panelOpen, overlay } = usePromptShell();
    const besidePanel = panelOpen && !overlay;
    const box = useRef<HTMLDivElement>(null);
    // The question in the landing field's type, and in the dock's.
    const fromText = useRef<HTMLSpanElement>(null);
    const toText = useRef<HTMLSpanElement>(null);
    // When the move lands, and the box it heads for.
    const lands = useRef(0);
    const target = useRef<Rect | null>(null);
    // A copy of the dock's rows, drawn inside the travelling box.
    const rows = useRef<HTMLElement | null>(null);

    // Draws the dock's own rows inside the travelling box, laid out as the
    // dock lays them out, so the box shows what the dock shows before it
    // lands and the two match when it does. The copy carries no surface and
    // no question: the box is the surface, and the two lines of text above
    // are the question. The first copy fades in as the move starts; a copy
    // taken after the dock changed takes its place at once.
    const drawRows = (node: HTMLElement, dock: HTMLElement) => {
        const frame = dock.parentElement;
        const copy = frame?.cloneNode(true);

        if (!frame || !(copy instanceof HTMLElement)) {
            return;
        }

        const first = rows.current === null;
        const at = frame.getBoundingClientRect();
        const box = dock.getBoundingClientRect();
        const surface = copy.querySelector<HTMLElement>('[data-dock-box]');

        copy.inert = true;
        copy.querySelectorAll('[id]').forEach((part) => part.removeAttribute('id'));
        copy.querySelector<HTMLElement>('[data-dock-question]')?.style.setProperty(
            'visibility',
            'hidden',
        );
        // The copy is not the dock's box, which this move heads for.
        surface?.removeAttribute('data-dock-box');

        if (surface) {
            Object.assign(surface.style, {
                background: 'none',
                borderColor: 'transparent',
                boxShadow: 'none',
                backdropFilter: 'none',
            });
        }

        Object.assign(copy.style, {
            position: 'absolute',
            top: `${at.top - box.top - node.clientTop}px`,
            left: `${at.left - box.left - node.clientLeft}px`,
            width: `${at.width}px`,
            opacity: first ? '0' : '1',
        });

        rows.current?.remove();
        rows.current = copy;
        node.appendChild(copy);

        if (first) {
            void copy.offsetWidth;
            copy.style.transition = 'opacity 240ms ease var(--ws-delay)';
            copy.style.opacity = '1';
        }
    };

    // Heads for `rect`, and says whether that changed the target. A new
    // target mid-move takes the time the move has left, with no delay, so the
    // copy lands when the dock shows.
    const head = (node: HTMLElement, rect: Rect): boolean => {
        const last = target.current;

        if (
            last &&
            Math.abs(last.left - rect.left) < 0.5 &&
            Math.abs(last.top - rect.top) < 0.5 &&
            Math.abs(last.width - rect.width) < 0.5 &&
            Math.abs(last.height - rect.height) < 0.5
        ) {
            return false;
        }

        if (last) {
            node.style.transitionDelay = '0s';
            node.style.transitionDuration = `${Math.max(0, lands.current - performance.now())}ms`;
        }

        target.current = rect;
        place(node, rect);

        return true;
    };

    useLayoutEffect(() => {
        const node = box.current;
        const field = inputRef.current;
        const from = field?.closest('form')?.getBoundingClientRect();
        const landingType = fromText.current;
        const dockType = toText.current;

        if (!node || !field || !from || !landingType || !dockType) {
            onLanded();
            onDone();

            return;
        }

        place(node, from);

        // The question starts in the landing field's type, over the field's
        // own text, and ends in the dock's type, where the dock's head row
        // draws it. Each copy of the line carries a transform between the
        // two places and sizes, and the two cross-fade.
        const look = getComputedStyle(field);
        const inner = node.getBoundingClientRect();
        const line = field.getBoundingClientRect();

        Object.assign(landingType.style, {
            fontFamily: look.fontFamily,
            fontSize: look.fontSize,
            fontWeight: look.fontWeight,
            lineHeight: look.lineHeight,
            letterSpacing: look.letterSpacing,
            color: look.color,
            left: `${line.left + field.clientLeft + parseFloat(look.paddingLeft) - inner.left - node.clientLeft}px`,
            top: `${line.top + field.clientTop + parseFloat(look.paddingTop) - inner.top - node.clientTop}px`,
            width: `${field.clientWidth}px`,
        });

        // The lines' layout offsets, which no transform moves: a transition
        // from an earlier run of this effect may still hold one line over
        // the other.
        const scale = parseFloat(getComputedStyle(dockType).fontSize) / parseFloat(look.fontSize);
        const dx = dockType.offsetLeft - landingType.offsetLeft;
        const dy =
            dockType.offsetTop +
            dockType.offsetHeight / 2 -
            (landingType.offsetTop + landingType.offsetHeight / 2);

        dockType.style.transform = `translate(${-dx}px, ${-dy}px) scale(${1 / scale})`;
        dockType.style.opacity = '0';

        // Read layout once so the start rect is committed before the move.
        void node.offsetWidth;
        node.dataset.moving = '';
        landingType.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        landingType.style.opacity = '0';
        dockType.style.removeProperty('transform');
        dockType.style.removeProperty('opacity');

        // The move runs on the Studio's clock: --ws-delay, then --ws-dur.
        const clock = getComputedStyle(node);

        lands.current =
            performance.now() +
            cssMs(clock.getPropertyValue('--ws-delay')) +
            cssMs(clock.getPropertyValue('--ws-dur'));

        // The copy stands in for the landing's prompt, which hides while
        // the landing fades, so one prompt shows at a time.
        const landing = inputRef.current?.closest('form');

        landing?.style.setProperty('visibility', 'hidden');

        let gone = 0;
        const finish = () => {
            window.clearTimeout(gone);
            node.removeEventListener('transitionend', finish);
            onDone();
        };
        const landed = window.setTimeout(() => {
            onLanded();
            // The dock's identical shadow lies under the copy, so the copy's
            // own goes at once and the two do not double while it fades.
            node.style.removeProperty('transition-delay');
            node.style.removeProperty('transition-duration');
            node.style.boxShadow = 'none';
            delete node.dataset.moving;
            node.dataset.fading = '';
            node.addEventListener('transitionend', finish);
            gone = window.setTimeout(finish, FADE_MAX_MS);
        }, TRAVEL_MS);

        return () => {
            window.clearTimeout(landed);
            window.clearTimeout(gone);
            node.removeEventListener('transitionend', finish);
            landing?.style.removeProperty('visibility');

            // React runs this effect twice in development. The second run
            // measures from the landing's field again, so the first leaves
            // no move, target or text transform behind.
            delete node.dataset.moving;
            target.current = null;
            node.style.removeProperty('transition-delay');
            node.style.removeProperty('transition-duration');
            landingType.style.removeProperty('transform');
            landingType.style.removeProperty('opacity');
        };
        // Measured once, on mount: the move starts from where the landing's
        // prompt stood when the question left it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Heads for the dock's box, following it if it changes on the way (the
    // panel opening on a reopened conversation); without a box, for the
    // dock's resting place beside the panel or not.
    useLayoutEffect(() => {
        const node = box.current;

        if (node?.dataset.moving === undefined) {
            return undefined;
        }

        let frame = 0;
        let dock: HTMLElement | null = null;
        const follow = () => {
            if (node.dataset.moving === undefined) {
                return;
            }

            dock ??= document.querySelector<HTMLElement>('[data-dock-box]');

            const rect = dock?.getBoundingClientRect();

            if (dock && rect && rect.height > 0) {
                // The remaining duration is set before the shadow changes,
                // so the shadow rides the same remaining time.
                const moved = head(node, {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                });

                if (moved) {
                    node.style.boxShadow = getComputedStyle(dock).boxShadow;
                }

                if (moved || rows.current === null) {
                    drawRows(node, dock);
                }
            } else {
                head(node, arrival(besidePanel));
            }

            frame = requestAnimationFrame(follow);
        };

        follow();

        return () => {
            cancelAnimationFrame(frame);
            rows.current?.remove();
            rows.current = null;
        };
    }, [besidePanel]);

    return (
        <div ref={box} className={styles.travel} aria-hidden="true">
            <span ref={fromText} className={styles.travelText}>
                {text}
            </span>
            <span ref={toText} className={styles.travelText}>
                {text}
            </span>
        </div>
    );
};

const PromptStage = () => {
    const model = useStudioModel();
    const shell = usePromptShell();
    const reduced = usePrefersReducedMotion();
    const {
        account,
        phone,
        guest,
        walled,
        doc,
        save,
        modals,
        landingHistory,
        examples,
        mode: { current: mode, leaving, inWorkspace, begin, sendDraft, startNew },
        stage: { sectionRef, theme },
        drafts: {
            query,
            setQuery,
            followDraft,
            setFollowDraft,
            inputRef,
            editTarget,
            setEditTarget,
        },
        canvas,
        panels: { shareData },
        title,
        firstPrompt,
    } = model;
    const {
        state,
        dispatch,
        panelOpen,
        overlay,
        rootRef,
        panelRef,
        heldCard,
        focusField,
        plans: links,
        report,
    } = shell;
    const unit = useDesignUnit();
    // A question's turn is running. A card change's turn (its prompt marked
    // `edit`) redraws one card in place, so the canvas stays where it is.
    const asked = model.chat.messages.findLast((message) => message.role === 'user');
    const replying = model.chat.thinking && !(asked?.role === 'user' && asked.edit);
    // The cards the running turn announced (useChat), drawn as placeholders.
    const coming = model.chat.coming;
    const viewPlanIds = useMemo(() => new Set(links.plans.flatMap((plan) => plan.cards)), [links]);
    const litIds = useMemo(
        () => litCards({ state, panelOpen, planOf: links.planOf, plans: links.plans }),
        [state, panelOpen, links],
    );
    // Fresh cards are placed against the width they will have once the panel
    // opens by itself, on the first card.
    const reserveRight =
        !overlay && !state.focus && state.panelChoice === null && !panelOpen
            ? (PANEL_WIDTH + SHELL_GUTTER) * unit
            : 0;

    // A card's `More info` or `View plan` opens its page, and the panel too
    // when it was closed.
    const reportCardOpens = useCallback(
        (page: 'card' | 'plan') => {
            if (!panelOpen) report('studio.panel', { action: 'open', how: 'card' });
            report('studio.panel_page', { view: page, from: 'card' });
        },
        [panelOpen, report],
    );
    const planOf = links.planOf;
    const { titleOf } = canvas;
    const editId = editTarget?.id ?? null;
    // A selected card shows its page in a panel that shows, and clearing
    // the selection returns to the page under it. A closed panel stays
    // closed: over a narrow window it would cover the card just pressed.
    const selectCard = useCallback(
        (id: string | null) => {
            if (id === editId) return;

            setEditTarget(id ? { id, title: titleOf(id) } : null);
            dispatch({ type: 'card.select', id, was: editId, shown: panelOpen });
            report('studio.card_select', { selected: id !== null });

            if (id && panelOpen) report('studio.panel_page', { view: 'card', from: 'card' });
        },
        [editId, setEditTarget, titleOf, dispatch, panelOpen, report],
    );
    const pointCard = useCallback(
        (id: string | null) => dispatch({ type: 'point', card: id }),
        [dispatch],
    );
    const showPlan = useCallback(
        (id: string) => {
            const plan = planOf(id);

            if (plan) {
                dispatch({ type: 'panel.show', page: { kind: 'plan', turn: plan.turn } });
                reportCardOpens('plan');
            }
        },
        [planOf, dispatch, reportCardOpens],
    );
    const promptCanvas = useMemo<PromptCanvas>(
        () => ({
            reserveRight,
            selectedId: editId,
            onSelect: selectCard,
            heldId: heldCard,
            litIds,
            onPoint: pointCard,
            viewPlanIds,
            onViewPlan: showPlan,
            replying,
            coming,
        }),
        [
            reserveRight,
            editId,
            selectCard,
            heldCard,
            litIds,
            pointCard,
            viewPlanIds,
            showPlan,
            replying,
            coming,
        ],
    );

    // The landing's prompt travels into the dock from the moment the
    // landing starts to leave (`moving`), then fades away over the shown dock
    // (`fading`).
    const [travel, setTravel] = useState<'moving' | 'fading' | null>(null);
    const [seenLeaving, setSeenLeaving] = useState(leaving);

    if (seenLeaving !== leaving) {
        setSeenLeaving(leaving);

        if (leaving && !reduced) {
            setTravel('moving');
        }
    }

    useEscape(
        ESCAPE_OVERLAY_PANEL,
        () => {
            // The closing panel turns inert and drops the focus it holds, so
            // focus goes back to the toggle that opened it.
            if (panelRef.current?.contains(document.activeElement)) {
                document.querySelector<HTMLElement>(`[aria-controls="${PANEL_ID}"]`)?.focus();
            }

            dispatch({ type: 'panel.dismiss' });
            report('studio.panel', { action: 'close', how: 'keyboard' });

            return true;
        },
        overlay && panelOpen,
    );

    const newSession = (how: 'button' | 'back') => {
        report('studio.new_session', { how });
        startNew();
    };

    const docked = mode !== 'start';
    // One callback for the life of the shell, so a re-render never detaches
    // the root while children's layout effects read it.
    const sectionNode = useCallback(
        (node: HTMLElement | null) => {
            sectionRef.current = node;
            rootRef.current = node;
        },
        [sectionRef, rootRef],
    );

    return (
        <section
            ref={sectionNode}
            className={classNames(studioStyles.section, styles.shell)}
            data-panel={panelOpen ? 'open' : 'closed'}
            data-overlay={overlay || undefined}
            data-focus={state.focus || undefined}
            data-transition={travel === 'moving' || leaving || undefined}
        >
            <CanvasBackdrop className={docked ? styles.backdropDocked : undefined} />

            <Header
                variant="studio"
                onBack={mode === 'start' ? undefined : () => newSession('back')}
                // A phone has room for the session title alone, in place of
                // the bar's own `Studio`. The bar settles once, as the move
                // into the workspace starts.
                title={docked && phone ? '' : undefined}
                titleAfter={docked ? <TopBarTitle compact={phone} /> : undefined}
                tools={docked ? <TopBarTools /> : undefined}
            >
                {docked && (
                    <>
                        <Button variant="bordered" onClick={() => newSession('button')}>
                            New Session
                        </Button>
                        <Button
                            variant="bordered"
                            onClick={() => modals.customize.setOpen((prev) => !prev)}
                        >
                            Customize
                        </Button>
                        {account && (
                            <Button
                                variant="dark"
                                wide
                                icon="arrow-up-right"
                                onClick={() => modals.share.show({ kind: 'whole' })}
                            >
                                Share
                            </Button>
                        )}
                    </>
                )}
            </Header>

            {!inWorkspace && (
                <StudioLanding
                    query={leaving ? followDraft : query}
                    onQueryChange={leaving ? setFollowDraft : setQuery}
                    onBegin={leaving ? sendDraft : begin}
                    examples={examples}
                    inputRef={inputRef}
                    history={account ? landingHistory.history : null}
                    openingId={landingHistory.openingId}
                    onOpenHistory={landingHistory.openHistory}
                    leaving={leaving}
                    wall={walled ? <GuestWall /> : null}
                />
            )}

            {travel && (
                <LandingTravel
                    onLanded={() => setTravel('fading')}
                    onDone={() => setTravel(null)}
                />
            )}

            {(inWorkspace || leaving) && (
                <>
                    <div
                        className={styles.canvasRegion}
                        data-studio-canvas=""
                        data-early={inWorkspace ? undefined : ''}
                    >
                        {inWorkspace && (
                            <div
                                className={styles.board}
                                style={themeVars(theme) as CSSProperties}
                                // Its cards carry the focus stops; an empty board
                                // is no stop of its own.
                                tabIndex={-1}
                            >
                                <Whiteboard
                                    {...whiteboardProps(model)}
                                    filter={undefined}
                                    onAskFollowUp={(id, cardTitle) => {
                                        canvas.askFollowUp(id, cardTitle);
                                        focusField();
                                    }}
                                    onCardInfo={(id) => {
                                        dispatch({
                                            type: 'panel.show',
                                            page: { kind: 'card', id },
                                        });
                                        reportCardOpens('card');
                                    }}
                                    prompt={promptCanvas}
                                />
                            </div>
                        )}
                        <div className={styles.dockFrame}>
                            <PromptDock />
                        </div>
                    </div>
                    {inWorkspace && (
                        <aside
                            ref={panelRef}
                            id={PANEL_ID}
                            className={styles.panel}
                            aria-label="This session"
                            // The closed panel keeps its place off the stage and
                            // its contents out of the focus order.
                            inert={!panelOpen}
                        >
                            <SessionPanel />
                        </aside>
                    )}
                </>
            )}

            <DownloadDataModal />

            {inWorkspace && (
                <StudioModals
                    modals={modals}
                    doc={doc}
                    visibleWidgets={canvas.widgets}
                    title={title}
                    firstPrompt={firstPrompt}
                    shareData={shareData}
                    cardTitleOf={canvas.titleOf}
                    createShare={save.createShare}
                    buildSnapshot={save.buildSnapshot}
                    guest={guest}
                />
            )}

            <FeedbackWidget className={inWorkspace ? styles.feedback : undefined} />
        </section>
    );
};

/**
 * The Prompt layout: the canvas under the top bar, the prompt dock floating
 * over its foot and the session panel at the right. shellFor picks it
 * for the prompt variant on an unshared page, so nothing here is read-only.
 */
const PromptShell = () => (
    <PromptShellProvider>
        <PromptStage />
    </PromptShellProvider>
);

export default PromptShell;
