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
import { TopBarTitle, TopBarTools } from './TopBar';

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
 * resting place while the landing leaves. The dock shows once it lands.
 */
const LandingTravel = ({ onDone }: { onDone: () => void }) => {
    const { query, inputRef } = useStudioModel().drafts;
    // The question as it left the landing.
    const [text] = useState(query);
    const { panelOpen, overlay } = usePromptShell();
    const besidePanel = panelOpen && !overlay;
    const box = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const node = box.current;
        const from = inputRef.current?.closest('form')?.getBoundingClientRect();

        if (!node || !from) {
            onDone();

            return;
        }

        place(node, from);
        // Read layout once so the start rect is committed before the move.
        void node.offsetWidth;
        node.dataset.moving = '';

        const timer = window.setTimeout(onDone, TRAVEL_MS);

        return () => window.clearTimeout(timer);
        // Measured once, on mount: the move starts from where the landing's
        // prompt stood when the question left it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Heads for the dock's place, and follows the panel if a card opens it
    // on the way.
    useLayoutEffect(() => {
        if (box.current?.dataset.moving !== undefined) {
            place(box.current, arrival(besidePanel));
        }
    }, [besidePanel]);

    return (
        <div ref={box} className={styles.travel} aria-hidden="true">
            <span className={styles.travelText}>{text}</span>
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
    } = shell;
    const unit = useDesignUnit();
    // A question's turn is running. A card change's turn (its prompt marked
    // `edit`) redraws one card in place, so the canvas stays where it is.
    const asked = model.chat.messages.findLast((message) => message.role === 'user');
    const replying = model.chat.thinking && !(asked?.role === 'user' && asked.edit);
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

    const planOf = links.planOf;
    // `titleOf` is a new function on every render; the ref keeps `selectCard`
    // stable while it reads the current titles.
    const titleOfRef = useRef(canvas.titleOf);

    useLayoutEffect(() => {
        titleOfRef.current = canvas.titleOf;
    });

    const selectCard = useCallback(
        (id: string | null) => setEditTarget(id ? { id, title: titleOfRef.current(id) } : null),
        [setEditTarget],
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
            }
        },
        [planOf, dispatch],
    );
    const editId = editTarget?.id ?? null;
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
        ],
    );

    // The landing's prompt travels into the dock from the moment the
    // landing starts to leave.
    const [travelling, setTravelling] = useState(false);
    const [seenLeaving, setSeenLeaving] = useState(leaving);

    if (seenLeaving !== leaving) {
        setSeenLeaving(leaving);

        if (leaving && !reduced) {
            setTravelling(true);
        }
    }

    useEscape(
        ESCAPE_OVERLAY_PANEL,
        () => {
            dispatch({ type: 'panel.dismiss' });

            return true;
        },
        overlay && panelOpen,
    );

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
            data-transition={travelling || leaving || undefined}
        >
            <CanvasBackdrop className={docked ? styles.backdropDocked : undefined} />

            <Header
                variant="studio"
                onBack={mode === 'start' ? undefined : startNew}
                // A phone has room for the session title alone, in place of
                // the bar's own `Studio`. The bar settles once, as the move
                // into the workspace starts.
                title={docked && phone ? '' : undefined}
                titleAfter={docked ? <TopBarTitle compact={phone} /> : undefined}
                tools={docked ? <TopBarTools /> : undefined}
            >
                {docked && (
                    <>
                        <Button variant="bordered" onClick={startNew}>
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

            {travelling && <LandingTravel onDone={() => setTravelling(false)} />}

            {inWorkspace && (
                <>
                    <div className={styles.canvasRegion} data-studio-canvas="">
                        <div className={styles.board} style={themeVars(theme) as CSSProperties}>
                            <Whiteboard
                                {...whiteboardProps(model)}
                                filter={undefined}
                                onAskFollowUp={(id, cardTitle) => {
                                    canvas.askFollowUp(id, cardTitle);
                                    focusField();
                                }}
                                onCardInfo={(id) =>
                                    dispatch({ type: 'panel.show', page: { kind: 'card', id } })
                                }
                                prompt={promptCanvas}
                            />
                        </div>
                        <div className={styles.dockFrame}>
                            <PromptDock />
                        </div>
                    </div>
                    <aside
                        ref={panelRef}
                        className={styles.panel}
                        aria-label="This session"
                        // The closed panel keeps its place off the stage and
                        // its contents out of the focus order.
                        inert={!panelOpen}
                    >
                        <SessionPanel />
                    </aside>
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
                    createShare={save.createShare}
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
