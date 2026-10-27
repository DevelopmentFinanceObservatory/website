'use client';

import classNames from 'classnames';
import { useState } from 'react';

import styles from './PlanLedger.module.scss';

import {
    canSwitch,
    isActiveOption,
    isSelectable,
    stepCount,
    switchReply,
    yearsText,
    type PlanChoiceView,
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

/** Why the last switch did not apply, with "Try again" when the plan still
 *  offers the option. */
const Notice = ({
    lead,
    text,
    onRetry,
}: {
    lead?: string | null;
    text: string;
    onRetry?: () => void;
}) => (
    <div className={styles.notice} role="status">
        <p className={styles.noticeText}>
            {lead && <span className={styles.noticeLead}>{lead}</span>}
            {text}
        </p>
        {onRetry && (
            <button type="button" className={styles.retry} onClick={onRetry}>
                Try again
            </button>
        )}
    </div>
);

/**
 * One scope choice: its name, the value the plan counts by, "Changed" and
 * the value it held when a switch moved it, and "Change", which opens the
 * options in place as a radio list. A partial option names the years it
 * covers and an unavailable one says why. While a switch is in flight every
 * option ignores clicks but keeps focus (`aria-disabled`), and the picked
 * one says the plan is updating.
 */
const ChoiceRow = ({
    choice,
    plan,
    open,
    onToggle,
    onSwitch,
}: {
    choice: PlanChoiceView;
    plan: PlanState | null;
    open: boolean;
    onToggle: () => void;
    onSwitch?: Switch;
}) => {
    const decision = choice.decision;
    const choiceId = decision?.choice_id;
    const switchable = !!(plan && onSwitch && decision && choiceId && canSwitch(plan));
    const busy = !!plan?.switching;
    const pending = plan?.switching?.choiceId === choiceId ? plan?.switching?.optionId : null;
    const notice = plan?.notice?.choiceId && plan.notice.choiceId === choiceId ? plan.notice : null;
    const failedOption = notice?.optionId;
    const retry =
        choiceId && failedOption && plan && onSwitch && switchReply(plan, choiceId, failedOption)
            ? () => onSwitch(choiceId, failedOption)
            : undefined;

    return (
        <div className={styles.row}>
            <span className={styles.name}>{choice.name}</span>
            <span className={styles.value}>
                {choice.value}
                {choice.changedFrom && <span className={styles.changed}>Changed</span>}
            </span>
            {switchable && (
                <button
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
                <div className={styles.options} role="radiogroup" aria-label={choice.name}>
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
                                role="radio"
                                aria-checked={active}
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
            {notice && (
                <Notice lead={notice.lead} text={notice.text} onRetry={busy ? undefined : retry} />
            )}
        </div>
    );
};

/**
 * "Counted as": the plan's scope choices as a ruled ledger, one row each.
 * `plan` and `onSwitch` make the rows switchable; an approved plan passes
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
    // The row the user opened or closed (null), for this plan; undefined
    // follows the plan.
    const [picked, setPicked] = useState<{ plan: PlanState | null; open?: string | null }>({
        plan,
    });

    if (picked.plan !== plan) {
        setPicked({ plan });
    }

    const open =
        picked.plan === plan && picked.open !== undefined
            ? picked.open
            : (plan?.switching?.choiceId ?? plan?.notice?.choiceId ?? null);
    const rowIds = new Set(view.choices.map((choice) => choice.decision?.choice_id));
    // A notice about the whole plan, or about a choice the plan no longer
    // shows, goes under the rows.
    const general =
        plan?.notice && !(plan.notice.choiceId && rowIds.has(plan.notice.choiceId))
            ? plan.notice
            : null;

    if (view.choices.length === 0 && !general) {
        return null;
    }

    return (
        <div className={classNames(styles.ledger, className)}>
            {view.choices.length > 0 && <p className={styles.head}>Counted as</p>}
            {view.choices.map((choice) => (
                <ChoiceRow
                    key={choice.key}
                    choice={choice}
                    plan={plan}
                    open={open === choice.key}
                    onSwitch={onSwitch}
                    onToggle={() =>
                        setPicked({ plan, open: open === choice.key ? null : choice.key })
                    }
                />
            ))}
            {general && (
                <div className={styles.row}>
                    <Notice lead={general.lead} text={general.text} />
                </div>
            )}
        </div>
    );
};
