'use client';

import classNames from 'classnames';
import { useEffect, useState } from 'react';

import styles from './ActivityLog.module.scss';
import PlanModal from './PlanModal';
import type { CardIcon } from './WidgetChips';
import railStyles from '../modals/CardInfoPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import type { ActivityEntry } from '@/lib/studio/activity';
import {
    clockText,
    outcomeParts,
    secondsText,
    spanText,
    triesText,
    turnView,
    type LogLine,
    type StepRow,
    type TurnOutcome,
    type TurnView,
} from '@/lib/studio/activityView';
import { approvedView, stepCount, type ApprovedPlan } from '@/lib/studio/plan';

type CardActions = {
    // Card icons by widget id, as the chat's card rows show them.
    cardIcons: Record<string, CardIcon>;
    onCanvas: (id: string) => boolean;
    onViewCard: (id: string) => void;
};

// The clock a live turn's timers read, ticking once a second while `live`.
const useNow = (live: boolean) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!live) {
            return;
        }

        const timer = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(timer);
    }, [live]);

    return now;
};

// A card the step made, by title; a click brings it into view on the canvas.
const CardChip = ({
    card,
    cardIcons,
    onCanvas,
    onViewCard,
}: { card: { id: string; title: string } } & CardActions) => {
    const shown = onCanvas(card.id);
    const icon = cardIcons[card.id];

    return (
        <button
            type="button"
            className={styles.card}
            disabled={!shown}
            title={shown ? 'Show this card on the canvas' : 'This card is off the canvas'}
            onClick={() => onViewCard(card.id)}
        >
            {icon && <Icon name={icon} className={styles.cardIcon} />}
            <span>{card.title}</span>
        </button>
    );
};

const stepClass: Record<StepRow['state'], string | undefined> = {
    complete: undefined,
    errored: undefined,
    failed: styles.stepFailed,
    skipped: styles.stepSkipped,
    pending: styles.stepSkipped,
    running: styles.stepRunning,
};

// One step on the rail: what it says it is, what it did, its card, and a
// retry that worked folded under "Worked on try N".
const Step = ({ row, now, ...actions }: { row: StepRow; now: number } & CardActions) => {
    const [triesOpen, setTriesOpen] = useState(false);
    const { retry } = row;
    const running = row.state === 'running';
    const duration = running
        ? spanText(now - row.startedAt)
        : row.durationMs != null
          ? secondsText(row.durationMs)
          : null;

    return (
        <li
            className={classNames(
                railStyles.step,
                styles.step,
                stepClass[row.state],
                row.card && railStyles.stepCard,
            )}
        >
            <div className={styles.row}>
                <span className={styles.label}>
                    {running && <span className={railStyles.stepKind}>Now</span>}
                    {row.state === 'errored' && (
                        <span className={railStyles.stepKind}>Hit an error</span>
                    )}
                    {row.state === 'failed' && (
                        <span className={classNames(railStyles.stepKind, styles.kindFailed)}>
                            Not done
                        </span>
                    )}
                    {row.state === 'skipped' && (
                        <span className={railStyles.stepKind}>Not run</span>
                    )}
                    {retry && (
                        <span className={railStyles.stepKind}>
                            <button
                                type="button"
                                className={styles.triesToggle}
                                aria-expanded={triesOpen}
                                onClick={() => setTriesOpen((open) => !open)}
                            >
                                Worked on try {retry.attempts.length}
                            </button>
                        </span>
                    )}
                    <span className={styles.labelText}>{row.label}</span>
                </span>
                {duration && (
                    <span
                        className={classNames(
                            styles.duration,
                            (running || row.slow) && styles.durationShown,
                        )}
                    >
                        {duration}
                    </span>
                )}
            </div>
            {row.detail && <p className={styles.detail}>{row.detail}</p>}
            {retry && triesOpen && (
                <div className={styles.tries}>
                    <span>{triesText(retry)}</span>
                    <ol>
                        {retry.attempts.map((attempt) => (
                            <li key={attempt.key}>
                                <span>{clockText(attempt.startedAt)}</span>
                                <span>{attempt.worked ? 'worked' : 'failed'}</span>
                                <span>
                                    {attempt.durationMs != null
                                        ? secondsText(attempt.durationMs)
                                        : ''}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
            {row.card && <CardChip card={row.card} {...actions} />}
        </li>
    );
};

// The approved plan on the rail, opened read-only by "View plan".
const PlanStep = ({ plan }: { plan: ApprovedPlan }) => {
    const [open, setOpen] = useState(false);
    const view = approvedView(plan);

    return (
        <li className={classNames(railStyles.step, styles.step, styles.stepPlan)}>
            <div className={styles.row}>
                <span className={styles.label}>
                    <span className={railStyles.stepKind}>
                        You approved the plan · {stepCount(view.steps.length)}
                    </span>
                    <span className={styles.labelText}>{view.title}</span>
                </span>
            </div>
            <div className={styles.detail}>
                <button
                    type="button"
                    className={styles.link}
                    aria-haspopup="dialog"
                    onClick={() => setOpen(true)}
                >
                    View plan
                </button>
            </div>
            <PlanModal view={view} open={open} onOpenChange={setOpen} />
        </li>
    );
};

const lineState: Record<LogLine['state'], string | undefined> = {
    complete: undefined,
    plan: undefined,
    pending: styles.lineSkipped,
    running: undefined,
    errored: undefined,
    failed: styles.lineFailed,
    retried: styles.lineRetried,
    skipped: styles.lineSkipped,
};

// Every line of the turn with its clock time, status lines in grey.
const FullLog = ({ log, now, ...actions }: { log: LogLine[]; now: number } & CardActions) => (
    <ol className={styles.full}>
        {log.map((line) => (
            <li
                key={line.key}
                className={classNames(
                    styles.line,
                    line.quiet && styles.lineQuiet,
                    lineState[line.state],
                )}
            >
                <span className={styles.lineTime}>{clockText(line.at)}</span>
                <span className={styles.lineLabel}>{line.label}</span>
                <span className={styles.lineTime}>
                    {line.state === 'running'
                        ? spanText(now - line.at)
                        : line.state === 'skipped'
                          ? 'not run'
                          : line.durationMs != null
                            ? secondsText(line.durationMs)
                            : ''}
                </span>
                {(line.detail || line.retriedAt != null) && (
                    <p className={styles.lineDetail}>
                        {line.retriedAt != null
                            ? `Tried again at ${clockText(line.retriedAt)}.`
                            : line.detail}
                    </p>
                )}
                {line.card && (
                    <span className={styles.lineCard}>
                        <CardChip card={line.card} {...actions} />
                    </span>
                )}
            </li>
        ))}
    </ol>
);

// The turn's outcome line, led on a live turn by its state. Each part keeps
// to one line with the dot before it, so the line wraps only between parts.
const Outcome = ({ outcome, now }: { outcome: TurnOutcome; now: number }) => (
    <span className={styles.outcome}>
        {outcome.state !== 'ended' && (
            <span className={styles.now}>
                {outcome.state === 'live' && <span className={styles.live} aria-hidden="true" />}
                {outcome.state === 'live' ? 'Working' : 'Waiting for you'}
            </span>
        )}
        {outcomeParts(outcome, now).map((part, index) => (
            <span key={part.key} className={styles.part}>
                {(index > 0 || outcome.state !== 'ended') && <i aria-hidden="true">·</i>}
                {part.alert ? <b>{part.text}</b> : part.text}
            </span>
        ))}
    </span>
);

const Turn = ({
    view,
    plan,
    latest,
    now,
    ...actions
}: {
    view: TurnView;
    plan: ApprovedPlan | undefined;
    // The newest turn, open until the user folds it; any other starts folded.
    latest: boolean;
    now: number;
} & CardActions) => {
    // Null until the user folds or opens the turn.
    const [chosen, setChosen] = useState<boolean | null>(null);
    const open = chosen ?? latest;
    const [showAll, setShowAll] = useState(false);

    return (
        <section className={styles.turn}>
            <button
                type="button"
                className={styles.head}
                aria-expanded={open}
                onClick={() => setChosen(!open)}
            >
                <span className={styles.question}>
                    <span className={styles.questionText}>{view.question}</span>
                </span>
                <span className={styles.meta}>
                    <Outcome outcome={view.outcome} now={now} />
                    <Icon
                        name="chevron-down"
                        className={classNames(styles.chevron, !open && styles.chevronClosed)}
                    />
                </span>
            </button>
            {open && (
                <div className={styles.body}>
                    {showAll ? (
                        <FullLog log={view.log} now={now} {...actions} />
                    ) : (
                        view.rows.length > 0 && (
                            <ol className={classNames(railStyles.rail, styles.rail)}>
                                {view.rows.map((row) =>
                                    row.kind === 'plan' ? (
                                        plan && <PlanStep key={row.key} plan={plan} />
                                    ) : (
                                        <Step key={row.key} row={row} now={now} {...actions} />
                                    ),
                                )}
                            </ol>
                        )
                    )}
                    {view.log.length > 0 && (
                        <button
                            type="button"
                            className={styles.fold}
                            aria-expanded={showAll}
                            onClick={() => setShowAll((was) => !was)}
                        >
                            {showAll
                                ? 'Show the steps that did work'
                                : `Show all ${view.log.length} ${view.log.length === 1 ? 'line' : 'lines'}, with times`}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
};

/**
 * The Activity view (the chat panel's Activity tab). Each turn opens with
 * its question and outcome, then the steps that did work on the planner
 * rail with the approved plan in its place, a card's title one click from
 * the card, and the full log with times one click down. The newest turn is
 * last, like the transcript, and the only one open at first.
 */
const ActivityLog = ({
    activity,
    cardTitles,
    cardIcons,
    plans,
    thinking,
    waiting,
    onCanvas,
    onViewCard,
}: {
    activity: ActivityEntry[];
    // Card titles by widget id, renames applied.
    cardTitles: Record<string, string>;
    // The plan the user approved, by turn.
    plans: Record<number, ApprovedPlan>;
    // The newest turn's stream is running.
    thinking: boolean;
    // A plan or question waits on the user.
    waiting: boolean;
} & CardActions) => {
    const views = activity.map((entry, index) =>
        turnView({
            entry,
            cardTitles,
            plan: plans[entry.turn],
            isLast: index === activity.length - 1,
            thinking,
            waiting,
        }),
    );
    const now = useNow(views.some((view) => view.outcome.state !== 'ended'));

    if (!views.length) {
        return <p className={styles.empty}>Nothing yet — the agent’s trace shows up here.</p>;
    }

    return (
        <div className={styles.log}>
            {views.map((view, index) => (
                <Turn
                    key={view.turn}
                    view={view}
                    plan={plans[view.turn]}
                    latest={index === views.length - 1}
                    now={now}
                    cardIcons={cardIcons}
                    onCanvas={onCanvas}
                    onViewCard={onViewCard}
                />
            ))}
        </div>
    );
};

export default ActivityLog;
