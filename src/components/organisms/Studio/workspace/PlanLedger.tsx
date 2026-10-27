'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState, type RefObject } from 'react';

import styles from './PlanLedger.module.scss';

import {
    canSwitch,
    isActiveOption,
    isSelectable,
    stepCount,
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
 * Why the last switch did not apply, with "Try again" when picking the
 * option again could apply. The live region stays mounted, empty until a
 * notice arrives, so a screen reader announces the notice when it does.
 */
const NoticeRegion = ({ notice, onRetry }: { notice: PlanNotice | null; onRetry?: () => void }) => (
    <div className={styles.live} role="status">
        {notice && (
            <div className={styles.notice}>
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
 * One scope choice: its name, the value the plan counts by, "Changed" and
 * the value it held when a switch moved it, and "Change", which opens the
 * options in place, drawn as a radio list: buttons in a group, the active
 * one pressed, each picking its option at once. A partial option names the
 * years it covers and an unavailable one says why. While a switch is in
 * flight every option ignores clicks but keeps focus (`aria-disabled`), and
 * the picked one says the plan is updating. When the plan this row's switch
 * produced arrives and the option that held focus is gone, focus moves to
 * "Change".
 */
const ChoiceRow = ({
    choice,
    plan,
    open,
    refocus,
    onToggle,
    onSwitch,
}: {
    choice: PlanChoiceView;
    plan: PlanState | null;
    open: boolean;
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
    const retry =
        notice?.retryable &&
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
                                        Updating plan
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
 * "Counted as": the plan's scope choices as a ruled ledger, one row each.
 * `plan` and `onSwitch` make the rows switchable. An approved plan passes
 * neither. One row opens at a time: the one being switched, else the one
 * whose switch failed, until the user opens or closes another.
 */
export const PlanLedger = ({
    view,
    plan = null,
    onSwitch,
    className,
}: {
    view: PlanView;
    plan?: PlanState | null;
    onSwitch?: Switch;
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

    // An approved plan without choices has nothing to show. A live plan keeps
    // its notice region mounted.
    if (view.choices.length === 0 && !plan) {
        return null;
    }

    return (
        <div
            className={classNames((view.choices.length > 0 || general) && styles.ledger, className)}
            onFocus={() => {
                hadFocusRef.current = true;
            }}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    hadFocusRef.current = false;
                }
            }}
        >
            {view.choices.length > 0 && <p className={styles.head}>Counted as</p>}
            {view.choices.map((choice) => (
                <ChoiceRow
                    key={choice.key}
                    choice={choice}
                    plan={plan}
                    open={open === choice.key}
                    refocus={hadFocusRef}
                    onSwitch={onSwitch}
                    onToggle={() =>
                        setPicked({ plan, open: open === choice.key ? null : choice.key })
                    }
                />
            ))}
            <div className={classNames(general && styles.row)}>
                <NoticeRegion notice={general} />
            </div>
        </div>
    );
};
