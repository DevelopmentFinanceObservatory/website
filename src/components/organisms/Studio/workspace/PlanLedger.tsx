'use client';

import classNames from 'classnames';
import { Fragment, useEffect, useRef, useState, type RefObject } from 'react';

import styles from './PlanLedger.module.scss';

import {
    canSwitch,
    isActiveOption,
    isSelectable,
    ledgerSections,
    stepCount,
    switchPendingText,
    switchReply,
    yearsText,
    type PlanChoiceView,
    type PlanNotice,
    type PlanState,
    type PlanView,
} from '@/lib/studio/plan';

type Switch = (choiceId: string, optionId: string) => void;

/** "Research plan v2 / 5 steps", with the Approved tag on an approved plan. */
export const PlanMeta = ({ view, approved }: { view: PlanView; approved?: boolean }) => (
    <p className={styles.meta}>
        <span>Research plan{view.version > 1 ? ` v${view.version}` : ''}</span>
        <span className={styles.sep}>/</span>
        <span>{stepCount(view.steps.length)}</span>
        {approved && <span className={styles.badge}>Approved</span>}
    </p>
);

/**
 * "Keep in mind": what qualifies the answer, one sentence a line, on the card
 * and in the full plan, and nothing without caveats. `className` places it in
 * its host, and `headClassName` draws its head as the host's other section
 * heads.
 */
export const PlanCaveats = ({
    caveats,
    className,
    headClassName,
}: {
    caveats: string[];
    className?: string;
    headClassName?: string;
}) =>
    caveats.length > 0 && (
        <div className={className}>
            <p className={headClassName ?? styles.caveatsHead}>Keep in mind</p>
            <ul className={styles.caveatList}>
                {caveats.map((caveat, index) => (
                    // Caveats are sentences with no id, and two may read alike.
                    <li key={index}>{caveat}</li>
                ))}
            </ul>
        </div>
    );

/** Whether `notice`'s `retryAt` has passed, true at once without one. */
const useWaited = (notice: PlanNotice | null): boolean => {
    const retryAt = notice?.retryAt ?? null;
    const [waited, setWaited] = useState<PlanNotice | null>(null);

    useEffect(() => {
        if (retryAt === null) {
            return;
        }

        const timer = setTimeout(() => setWaited(notice), Math.max(0, retryAt - Date.now()));

        return () => clearTimeout(timer);
    }, [notice, retryAt]);

    return retryAt === null || waited === notice;
};

/**
 * Why the last switch did not apply, with "Try again" when picking the
 * option again could apply. The live region stays mounted, empty until a
 * notice arrives, so a screen reader announces the notice when it does.
 */
const NoticeRegion = ({ notice, onRetry }: { notice: PlanNotice | null; onRetry?: () => void }) => (
    <div className={styles.live} role="status">
        {notice && (
            <div className={classNames(styles.notice, notice.quiet && styles.noticeQuiet)}>
                <p className={styles.noticeText}>
                    {notice.lead && <span className={styles.noticeLead}>{notice.lead}</span>}
                    {notice.text}
                </p>
                {onRetry && (
                    <button type="button" className={styles.retry} onClick={onRetry}>
                        Try again
                    </button>
                )}
            </div>
        )}
    </div>
);

/**
 * One scope choice or planner decision: its name, the value the plan holds,
 * "Changed" and the value it held when a switch moved it, and "Change",
 * which opens the options in place, drawn as a radio list: buttons in a
 * group, the active one pressed, each picking its option at once. A partial
 * option names the years it covers and an unavailable one says why. While a
 * switch is in flight every option ignores clicks but keeps focus
 * (`aria-disabled`), and the picked one says the plan is updating, or
 * replanning on a planner decision, until the harness answers. When the plan
 * this row's switch produced arrives and the option that held focus is gone,
 * focus moves to "Change".
 */
const ChoiceRow = ({
    choice,
    plan,
    open,
    reasons,
    refocus,
    onToggle,
    onSwitch,
}: {
    choice: PlanChoiceView;
    plan: PlanState | null;
    open: boolean;
    reasons: boolean;
    // Focus was inside the ledger when it last moved (see PlanLedger).
    refocus: RefObject<boolean>;
    onToggle: () => void;
    onSwitch?: Switch;
}) => {
    const changeRef = useRef<HTMLButtonElement>(null);
    const decision = choice.decision;
    const choiceId = decision?.choice_id;
    const switchable = !!(plan && onSwitch && decision && choiceId && canSwitch(plan));
    const busy = !!plan?.switching;
    const pending = plan?.switching?.choiceId === choiceId ? plan?.switching?.optionId : null;
    const notice = plan?.notice?.choiceId && plan.notice.choiceId === choiceId ? plan.notice : null;
    const failedOption = notice?.optionId;
    // "Try again" waits out the delay the harness asked for.
    const waited = useWaited(notice);
    const retry =
        notice?.retryable &&
        waited &&
        !busy &&
        choiceId &&
        failedOption &&
        plan &&
        onSwitch &&
        switchReply(plan, choiceId, failedOption)
            ? () => onSwitch(choiceId, failedOption)
            : undefined;

    useEffect(() => {
        const active = document.activeElement;

        if (
            refocus.current &&
            plan?.switched === choiceId &&
            (!active || active === document.body)
        ) {
            changeRef.current?.focus();
        }
    }, [refocus, plan, choiceId]);

    return (
        <div className={styles.row}>
            <span className={styles.name}>{choice.name}</span>
            <span className={styles.value}>
                {choice.value}
                {choice.changedFrom && <span className={styles.changed}>Changed</span>}
            </span>
            {switchable && (
                <button
                    ref={changeRef}
                    type="button"
                    className={styles.change}
                    aria-expanded={open}
                    disabled={busy && !pending}
                    onClick={onToggle}
                >
                    {open ? 'Done' : 'Change'}
                </button>
            )}
            {choice.changedFrom && (
                <span className={styles.was}>
                    Changed from {choice.changedFrom}.
                    {choice.changedReason && ` ${choice.changedReason}`}
                </span>
            )}
            {reasons && choice.reason && <span className={styles.why}>{choice.reason}</span>}
            {switchable && open && decision?.options && (
                <div className={styles.options} role="group" aria-label={choice.name}>
                    {decision.options.map((option) => {
                        const active = isActiveOption(decision, option);
                        const isPending = option.option_id === pending;
                        const inert = busy || !isSelectable(decision, option);
                        const sub =
                            option.status === 'unavailable'
                                ? option.reason
                                : option.status === 'partial' && option.years
                                  ? `Covers ${yearsText(option.years)}`
                                  : null;

                        return (
                            <button
                                key={option.option_id}
                                type="button"
                                aria-pressed={active}
                                aria-busy={isPending || undefined}
                                aria-disabled={(inert && !active) || undefined}
                                className={classNames(
                                    styles.option,
                                    active && styles.optionOn,
                                    isPending && styles.optionPending,
                                )}
                                onClick={() =>
                                    !inert && choiceId && onSwitch?.(choiceId, option.option_id)
                                }
                            >
                                <span className={styles.radio} />
                                <span className={styles.optionLabel}>
                                    {option.label}
                                    {sub && <span className={styles.optionSub}>{sub}</span>}
                                </span>
                                {isPending && (
                                    <span className={styles.optionTag}>
                                        <span className={styles.spin} />
                                        {switchPendingText(choiceId)}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
            <NoticeRegion notice={notice} onRetry={retry} />
        </div>
    );
};

/**
 * The plan's choices as a ruled ledger, one row each, in groups
 * with their own heads (ledgerSections): "Counted as", the scope choices and
 * a line for each choice the switch moved that has no row, then "Choices the
 * plan made", the planner decisions. `plan` and `onSwitch` make the rows
 * switchable. An approved plan passes neither.
 * `reasons` adds why the plan holds each choice. One row opens at a time:
 * the one being switched, else the one whose switch failed, until the user
 * opens or closes another.
 */
export const PlanLedger = ({
    view,
    plan = null,
    onSwitch,
    reasons = false,
    className,
}: {
    view: PlanView;
    plan?: PlanState | null;
    onSwitch?: Switch;
    reasons?: boolean;
    className?: string;
}) => {
    // The row the user opened or closed (null) for this plan. Undefined
    // follows the plan.
    const [picked, setPicked] = useState<{ plan: PlanState | null; open?: string | null }>({
        plan,
    });
    // Focus was inside this ledger when it last moved. An option that held
    // it unmounts without a blur, so it stays set across a re-offer.
    const hadFocusRef = useRef(false);

    if (picked.plan !== plan) {
        setPicked({ plan });
    }

    const open =
        picked.plan === plan && picked.open !== undefined
            ? picked.open
            : (plan?.switching?.choiceId ?? plan?.notice?.choiceId ?? null);
    const rowIds = new Set(view.choices.map((choice) => choice.decision?.choice_id));
    // A notice about the whole plan, or about a choice the plan does not
    // show, goes under the rows.
    const general =
        plan?.notice && !(plan.notice.choiceId && rowIds.has(plan.notice.choiceId))
            ? plan.notice
            : null;

    const sections = ledgerSections(view);
    const ruled = sections.length > 0;

    // An approved plan without choices has nothing to show. A live plan keeps
    // its notice region mounted.
    if (!ruled && !plan) {
        return null;
    }

    return (
        <div
            className={classNames((ruled || general) && styles.ledger, className)}
            onFocus={() => {
                hadFocusRef.current = true;
            }}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    hadFocusRef.current = false;
                }
            }}
        >
            {sections.map((section) => (
                <Fragment key={section.key}>
                    <p className={styles.head}>{section.head}</p>
                    {section.choices.map((choice) => (
                        <ChoiceRow
                            key={choice.key}
                            choice={choice}
                            plan={plan}
                            open={open === choice.key}
                            reasons={reasons}
                            refocus={hadFocusRef}
                            onSwitch={onSwitch}
                            onToggle={() =>
                                setPicked({ plan, open: open === choice.key ? null : choice.key })
                            }
                        />
                    ))}
                    {section.moved.map((move) => (
                        <p key={move.key} className={classNames(styles.row, styles.moved)}>
                            <span className={styles.was}>
                                Changed from {move.from} to {move.to}.
                                {move.reason && ` ${move.reason}`}
                            </span>
                        </p>
                    ))}
                </Fragment>
            ))}
            <div className={classNames(general && styles.row)}>
                <NoticeRegion notice={general} />
            </div>
        </div>
    );
};
