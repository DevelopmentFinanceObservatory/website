import classNames from 'classnames';
import {
    type CSSProperties,
    useEffect,
    useEffectEvent,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import DockField from './DockField';
import DockPills from './DockPills';
import {
    AboutRow,
    ApprovalRow,
    FoldedRow,
    QuestionHead,
    QueuedRows,
    SetAsideRow,
    Spinner,
    StatusRow,
} from './DockRows';
import { type ChipActions, ReplySheet, ThreadSheet } from './DockSheets';
import PlanSheet from './PlanSheet';
import styles from './PromptDock.module.scss';
import { useStudioModel } from '../../../hooks/studioContext';
import GuestWall from '../../../GuestWall';
import CharCount from '../../../prompt/CharCount';
import ClarifyPicker from '../../../workspace/ClarifyPicker';
import PlanModal from '../../../workspace/PlanModal';
import { useEscape, usePromptShell } from '../shellContext';

import Icon from '@/components/atoms/Icon/Icon';
import { amendmentCount, followUpAction } from '@/lib/studio/composer';
import { dockField, dockView, pendingItem, planKey, runningLabel } from '@/lib/studio/dockView';
import { type PlanState, planView } from '@/lib/studio/plan';
import { ESCAPE_DOCK_SHEET, type Sheet } from '@/lib/studio/promptShell';

// The control that takes focus when the focused one leaves with a redraw.
const COUNTERPART: Record<string, string> = {
    fold: 'open',
    open: 'fold',
    'plan-fold': 'plan-open',
    'plan-open': 'plan-fold',
};

type Target = 'chart' | 'number' | 'table' | 'note';

const TARGET_OF: Record<string, Target> = {
    chart: 'chart',
    key_number: 'number',
    table: 'table',
    text: 'note',
};

const ICON_OF = {
    chart: 'chart-line',
    number: 'key-number',
    table: 'chart-table',
    note: 'note',
} as const;

/**
 * The Prompt layout's dock: the follow-up pills, the focus pill, and the box
 * that holds the sheets, the one context row, the queued messages and the
 * input row. dockView.ts decides what shows; this draws it, sends through
 * `model.chat` as the chat's foot does, reports its heights to the shell, and
 * folds an open reply when the reader turns to the canvas.
 */
const PromptDock = () => {
    const model = useStudioModel();
    const shell = usePromptShell();
    const { chat, drafts, canvas, doc, walled } = model;
    const { state, dispatch, rootRef, dockBand, announce } = shell;
    const draft = drafts.followDraft;
    const setDraft = drafts.setFollowDraft;
    const editTarget = drafts.editTarget;

    // The question the reader's sheet choice was made on.
    const [sheetTurn, setSheetTurn] = useState<number | null>(null);
    // The plan the reader cancelled, kept so `View plan` can show it.
    const [setAside, setSetAside] = useState<{ turn: number; plan: PlanState } | null>(null);
    const [planFolded, setPlanFolded] = useState<string | null>(null);
    const [setAsideOpen, setSetAsideOpen] = useState(false);

    const target = editTarget
        ? (TARGET_OF[canvas.widgets.find((widget) => widget.id === editTarget.id)?.kind ?? ''] ??
          'chart')
        : null;

    const view = useMemo(
        () =>
            dockView({
                messages: chat.messages,
                activity: chat.activity,
                widgets: chat.widgets,
                canvasCards: canvas.widgets.length,
                thinking: chat.thinking,
                plan: chat.plan,
                clarify: !!chat.clarify,
                walled,
                editTarget,
                draft,
                sheet: state.sheet,
                sheetTurn,
                focus: state.focus,
                setAside: setAside?.turn ?? null,
                planFolded,
            }),
        [
            chat.messages,
            chat.activity,
            chat.widgets,
            canvas.widgets.length,
            chat.thinking,
            chat.plan,
            chat.clarify,
            walled,
            editTarget,
            draft,
            state.sheet,
            sheetTurn,
            state.focus,
            setAside,
            planFolded,
        ],
    );

    const question = view.question;
    const field = dockField({ asked: !!question, planLive: !!chat.plan?.live, target });
    const count = amendmentCount(draft, chat.plan);
    const countId = useId();

    const fieldRef = useRef<HTMLTextAreaElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLButtonElement>(null);

    const choose = (sheet: Sheet) => {
        setSheetTurn(question?.turn ?? null);
        dispatch({ type: 'sheet.set', sheet });
    };
    const fold = () => choose('folded');

    const send = () => {
        const action = followUpAction({ draft, plan: chat.plan, editTarget });

        switch (action.kind) {
            case 'hold':
                return;
            case 'amend':
                chat.respondPlan('amend', action.text);
                break;
            case 'card':
                chat.send(action.text, action.options);
                drafts.setEditTarget(null);
                break;
            case 'send':
                chat.send(action.text);
                break;
        }

        setDraft('');
    };

    const chips: ChipActions = {
        titles: doc.titles,
        views: doc.views,
        widgets: chat.widgets,
        onCanvas: canvas.isOnCanvas,
        onGo: canvas.flyTo,
        onAdd: canvas.add,
        onRemove: canvas.remove,
    };

    // --- Heights for the canvas foot ---------------------------------------

    const restBox = useRef(0);
    const measured = useRef({ sheetNone: true, pills: false });

    useEffect(() => {
        measured.current = { sheetNone: view.sheet === 'none', pills: view.pills };
    });

    useEffect(() => {
        const frame = frameRef.current;

        if (!frame) {
            return;
        }

        const measure = () => {
            const box = boxRef.current;
            const root = rootRef.current;
            const current = frame.getBoundingClientRect().height;
            const boxHeight = box?.getBoundingClientRect().height ?? 0;

            if (measured.current.sheetNone && boxHeight > 0) {
                restBox.current = boxHeight;
            }

            const pillsRow = measured.current.pills ? current - boxHeight : 0;
            const rest = (restBox.current || boxHeight) + Math.max(0, pillsRow);

            dockBand.current = { rest, current };
            root?.style.setProperty('--dock-rest', `${rest}px`);
            root?.style.setProperty('--dock-current', `${current}px`);
        };
        const observer = new ResizeObserver(measure);

        observer.observe(frame);

        if (boxRef.current) {
            observer.observe(boxRef.current);
        }

        return () => observer.disconnect();
    }, [rootRef, dockBand]);

    // --- Folding when the reader turns to the canvas ------------------------

    const foldOnCanvas = useEffectEvent((event: Event) => {
        // The dock floats inside the canvas region, and a press on it is
        // not a press on the canvas.
        if (
            !(event.target instanceof Element) ||
            !event.target.closest('[data-studio-canvas]') ||
            frameRef.current?.contains(event.target)
        ) {
            return;
        }

        if ((view.sheet === 'reply' && !view.held) || view.sheet === 'thread') {
            fold();
        }
    });

    useEffect(() => {
        const root = rootRef.current;

        if (!root) {
            return;
        }

        const listener = (event: Event) => foldOnCanvas(event);
        const options = { passive: true, capture: true };

        for (const type of ['pointerdown', 'wheel', 'touchstart']) {
            root.addEventListener(type, listener, options);
        }

        return () => {
            for (const type of ['pointerdown', 'wheel', 'touchstart']) {
                root.removeEventListener(type, listener, options);
            }
        };
    }, [rootRef]);

    // --- Escape ----------------------------------------------------------

    useEscape(ESCAPE_DOCK_SHEET, () => {
        const active = document.activeElement;
        const typing =
            active instanceof HTMLElement &&
            active.matches('input, textarea, [contenteditable="true"]') &&
            !frameRef.current?.contains(active);

        if (typing || document.querySelector('[role="dialog"][aria-modal="true"]')) {
            return false;
        }

        if (view.sheet === 'reply' || view.sheet === 'thread') {
            fold();

            return true;
        }

        return false;
    });

    // --- Focus mode ---------------------------------------------------------

    // A waiting plan or a clarifying question ends focus mode once each.
    const pending = pendingItem(chat.plan, chat.clarify);
    const endedFor = useRef<string | null>(null);

    useEffect(() => {
        if (pending && pending !== endedFor.current) {
            endedFor.current = pending;

            if (state.focus) {
                dispatch({ type: 'focus.set', on: false });
            }
        }
    }, [pending, state.focus, dispatch]);

    // Focus inside the box moves to the pill as the box folds away.
    useEffect(() => {
        if (state.focus && boxRef.current?.contains(document.activeElement)) {
            pillRef.current?.focus({ preventScroll: true });
        }
    }, [state.focus]);

    // A press on the focus pill leaves focus and puts the caret in the field.
    const caretNext = useRef(false);
    const leaveFocus = () => {
        dispatch({ type: 'focus.set', on: false });
        caretNext.current = true;
    };

    useEffect(() => {
        if (!state.focus && caretNext.current) {
            caretNext.current = false;
            fieldRef.current?.focus({ preventScroll: true });
        }
    }, [state.focus]);

    // --- Focus when the box redraws ----------------------------------------

    const lastFocus = useRef<HTMLElement | null>(null);

    useLayoutEffect(() => {
        const was = lastFocus.current;

        if (!was || was.isConnected || state.focus) {
            return;
        }

        const active = document.activeElement;

        if (active && active !== document.body) {
            return;
        }

        const name = was.dataset.dock ? COUNTERPART[was.dataset.dock] : undefined;
        const next = name
            ? boxRef.current?.querySelector<HTMLElement>(`[data-dock="${name}"]`)
            : null;

        (next ?? boxRef.current)?.focus({ preventScroll: true });
        lastFocus.current = null;
    });

    // --- Entering the workspace -------------------------------------------

    const inWorkspace = model.mode.inWorkspace;

    useEffect(() => {
        if (!inWorkspace || model.phone) {
            return;
        }

        // The shell hides the dock while the landing's prompt travels into
        // it, and a hidden field takes no focus, so this waits for it to
        // show, for at most two seconds.
        const until = performance.now() + 2000;
        let frame = 0;
        const tryFocus = () => {
            const field = fieldRef.current;

            if (field?.checkVisibility({ visibilityProperty: true })) {
                // The page is already placed, so focusing must not scroll it.
                field.focus({ preventScroll: true });

                return;
            }

            if (performance.now() < until) {
                frame = requestAnimationFrame(tryFocus);
            }
        };

        tryFocus();

        return () => cancelAnimationFrame(frame);
        // Only on entering the workspace; a later resize across the phone
        // breakpoint must not pull focus.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inWorkspace]);

    // --- Announcements ------------------------------------------------------

    const replyStarted = !!question?.reply.trim();
    const streaming = chat.thinking && !chat.plan && !chat.clarify && !view.running;
    const said = useRef({ turn: -1, started: false, ready: false });

    useEffect(() => {
        if (!question) {
            return;
        }

        if (said.current.turn !== question.turn) {
            said.current = { turn: question.turn, started: false, ready: false };
        }

        if (streaming && replyStarted && !said.current.started) {
            said.current.started = true;
            announce('Answer started');
        }

        if (!chat.thinking && replyStarted && !said.current.ready) {
            said.current.ready = true;
            announce('Answer ready');
        }
    }, [question, streaming, replyStarted, chat.thinking, announce]);

    // --- Draw ------------------------------------------------------------

    const style = {
        '--dock-cap':
            view.cap === 'words'
                ? 'var(--dock-cap-words)'
                : view.cap === 'plan'
                  ? 'none'
                  : 'var(--dock-cap-normal)',
    } as CSSProperties;

    const head =
        view.running ??
        ((view.row?.kind === 'status' || view.sheet === 'plan') &&
        view.sheet !== 'reply' &&
        view.sheet !== 'thread'
            ? question
            : null);

    const plan = chat.plan;
    const planLive = plan?.live ?? false;

    const respond = (decision: 'approve' | 'reject') => {
        if (decision === 'reject' && chat.plan && question) {
            setSetAside({ turn: question.turn, plan: chat.plan });
        }

        chat.respondPlan(decision);
    };

    const sheet = (() => {
        switch (view.sheet) {
            case 'clarify':
                return (
                    chat.clarify && (
                        <section className={styles.sheet} aria-label="Question">
                            {question && (
                                <div className={styles.clarifyHead}>
                                    {question.about && (
                                        <p className={styles.aboutLine}>
                                            About{' '}
                                            <span className={styles.aboutTitle}>
                                                {question.about}
                                            </span>
                                        </p>
                                    )}
                                    <p className={styles.clarifyQuestion} title={question.text}>
                                        {question.text}
                                    </p>
                                </div>
                            )}
                            <div className={classNames(styles.scroll, styles.clarify)}>
                                <ClarifyPicker
                                    clarify={chat.clarify}
                                    onAnswer={chat.answerClarify}
                                    onSkip={chat.skipClarify}
                                />
                            </div>
                        </section>
                    )
                );
            case 'plan':
                return (
                    plan &&
                    question && (
                        <PlanSheet
                            plan={plan}
                            open={view.planOpen}
                            onFold={() => setPlanFolded(planKey(question.turn, plan.version))}
                            onOpen={() => setPlanFolded(null)}
                            onSwitch={walled ? undefined : chat.switchChoice}
                            onApprove={() => respond('approve')}
                            onCancel={() => respond('reject')}
                            announce={announce}
                        />
                    )
                );
            case 'reply':
                return (
                    question && (
                        <ReplySheet
                            question={question}
                            count={view.questions.length}
                            streaming={streaming}
                            chips={chips}
                            onThread={() => choose('thread')}
                            onFold={fold}
                        />
                    )
                );
            case 'thread':
                return (
                    <ThreadSheet
                        questions={view.questions}
                        runningTurn={streaming ? (question?.turn ?? null) : null}
                        chips={chips}
                        onClose={fold}
                    />
                );
            case 'none':
                return null;
        }
    })();

    const row = (() => {
        switch (view.row?.kind) {
            case 'status':
                return (
                    <StatusRow
                        status={chat.status}
                        stalled={chat.stalled}
                        stepOf={view.row.stepOf}
                        onStop={chat.stop}
                    />
                );
            case 'plan':
                return (
                    <ApprovalRow
                        busy={!!chat.plan?.switching}
                        onCancel={() => respond('reject')}
                        onApprove={() => respond('approve')}
                    />
                );
            case 'set_aside':
                return <SetAsideRow onView={setAside ? () => setSetAsideOpen(true) : null} />;
            case 'about':
                return (
                    editTarget && (
                        <AboutRow
                            title={view.row.title}
                            icon={ICON_OF[target ?? 'chart']}
                            onGo={() => canvas.flyTo(editTarget.id)}
                            onClear={() => drafts.setEditTarget(null)}
                        />
                    )
                );
            case 'folded':
                return (
                    <FoldedRow
                        text={view.row.text}
                        onOpen={view.row.openable ? () => choose('open') : null}
                    />
                );
            case undefined:
                return null;
        }
    })();

    const pillShows = state.focus;

    if (!inWorkspace) {
        return null;
    }

    return (
        <div
            ref={frameRef}
            className={styles.dock}
            style={style}
            data-sheet={view.sheet}
            data-focus={state.focus || undefined}
        >
            {view.pills && question && (
                <DockPills
                    followups={question.followups}
                    chips={question.chips}
                    onFollowup={(text) => {
                        chat.send(text);
                    }}
                    onChip={(chip) => {
                        chat.applyChoice(chip);
                    }}
                />
            )}
            <button
                ref={pillRef}
                type="button"
                className={styles.focusPill}
                aria-label={`Ask Studio: ${chat.thinking ? runningLabel(chat.status) : 'Ask a follow up...'}`}
                aria-hidden={!pillShows || undefined}
                tabIndex={pillShows ? 0 : -1}
                inert={!pillShows}
                onClick={leaveFocus}
            >
                {chat.thinking ? (
                    <>
                        <Spinner />
                        <span className={styles.focusText}>{runningLabel(chat.status)}</span>
                    </>
                ) : (
                    <>
                        <Icon name="ask" className={styles.focusGlyph} />
                        <span className={styles.focusText}>Ask a follow up...</span>
                    </>
                )}
            </button>
            <div
                ref={boxRef}
                className={styles.box}
                // Focus falls back here when the control that held it
                // leaves with a redraw, so the arrow keys and Escape still
                // reach the page.
                tabIndex={-1}
                inert={state.focus}
                onFocus={(event) => {
                    if (event.target instanceof HTMLElement && event.target !== boxRef.current) {
                        lastFocus.current = event.target;
                    }
                }}
            >
                <div className={styles.upper}>
                    {head && <QuestionHead text={head.text} about={head.about} />}
                    {sheet}
                    {row}
                    {chat.queued.length > 0 && (
                        <QueuedRows queued={chat.queued} onRemove={chat.unqueue} />
                    )}
                </div>
                {walled ? (
                    <div className={styles.wall}>
                        <GuestWall />
                    </div>
                ) : (
                    view.sheet !== 'clarify' && (
                        <>
                            <DockField
                                fieldRef={fieldRef}
                                value={draft}
                                onChange={setDraft}
                                onSubmit={send}
                                placeholder={field.placeholder}
                                label={field.label}
                                quiet={view.quietSend}
                                invalid={count.over}
                                describedBy={planLive ? countId : undefined}
                            />
                            {planLive && (
                                <div className={styles.count}>
                                    <CharCount id={countId} text={count} />
                                </div>
                            )}
                        </>
                    )
                )}
            </div>
            {setAside && (
                <PlanModal
                    view={planView(setAside.plan)}
                    plan={{ ...setAside.plan, live: false }}
                    open={setAsideOpen}
                    onOpenChange={setSetAsideOpen}
                />
            )}
        </div>
    );
};

export default PromptDock;
