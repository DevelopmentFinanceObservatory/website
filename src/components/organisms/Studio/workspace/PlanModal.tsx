'use client';

import classNames from 'classnames';
import { useState } from 'react';

import styles from './PlanModal.module.scss';
import type { ChatState } from '../hooks/useChat';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import {
    canSwitch,
    isActiveOption,
    isSelectable,
    movedSentence,
    switchOptions,
    yearsText,
    type PlanState,
} from '@/lib/studio/plan';
import type { PlanDecision } from '@/lib/studio/wire';

type PlanModalProps = {
    plan: NonNullable<ChatState['plan']>;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApprove: () => void;
    onCancel: () => void;
    // Switches a scope decision to another option. Left out where the
    // viewer cannot change the plan (a guest, a read-only view).
    onSwitch?: (choiceId: string, optionId: string) => void;
};

/** What the switch that produced this plan changed, said once on the plan
 *  it re-offered. The live region stays mounted, empty between switches,
 *  so a screen reader announces the sentences when they arrive. */
export const PlanMovedNote = ({ plan, className }: { plan: PlanState; className?: string }) => (
    <ul className={classNames(styles.moved, className)} aria-live="polite">
        {plan.moved.map((moved) => (
            <li key={moved.choice_id}>{movedSentence(moved)}</li>
        ))}
    </ul>
);

/**
 * One decision: the question, the chosen answer and why. A scope decision
 * the plan lets the user switch also lists its options, the active one
 * marked; a partial option names the years it covers, an unavailable one
 * says why and cannot be picked. While a switch is in flight every option
 * ignores clicks but keeps focus (`aria-disabled`). Only unavailable ones
 * are natively disabled.
 */
const DecisionRow = ({
    decision,
    plan,
    onSwitch,
}: {
    decision: PlanDecision;
    plan: PlanState;
    onSwitch?: (choiceId: string, optionId: string) => void;
}) => {
    const options = onSwitch && canSwitch(plan) ? switchOptions(decision) : null;
    const choiceId = decision.choice_id;

    return (
        <li className={styles.decision}>
            {decision.question} — <strong>{decision.chosen}</strong>
            {decision.reason ? ` (${decision.reason})` : ''}
            {options && choiceId && (
                <div className={styles.options} role="group" aria-label={decision.question}>
                    {options.map((option) => {
                        const active = isActiveOption(decision, option);
                        const pending =
                            plan.switching?.choiceId === choiceId &&
                            plan.switching.optionId === option.option_id;
                        const inert = !isSelectable(decision, option) || !!plan.switching;
                        const note =
                            option.status === 'unavailable'
                                ? option.reason
                                : option.status === 'partial' && option.years
                                  ? `Covers ${yearsText(option.years)}`
                                  : null;

                        return (
                            <button
                                key={option.option_id}
                                type="button"
                                className={classNames(
                                    styles.option,
                                    active && styles.optionActive,
                                    pending && styles.optionPending,
                                )}
                                aria-pressed={active}
                                aria-busy={pending || undefined}
                                aria-disabled={inert || undefined}
                                disabled={option.status === 'unavailable'}
                                onClick={() => !inert && onSwitch?.(choiceId, option.option_id)}
                            >
                                <span className={styles.optionLabel}>{option.label}</span>
                                {note && <span className={styles.optionNote}>{note}</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </li>
    );
};

/**
 * The full plan (design: "Proposed Research Plan – N Steps" modal): every
 * step on the dot rail with its description unfolded (a chevron folds it),
 * the agent's decisions under them (a scope decision with its options to
 * switch between), and the same "Start building?" bar with Cancel and
 * Approve pinned to the bottom.
 */
const PlanModal = ({ plan, open, onOpenChange, onApprove, onCancel, onSwitch }: PlanModalProps) => {
    // Steps start unfolded — the modal exists to read them.
    const [folded, setFolded] = useState<Set<string>>(new Set());

    const toggleStep = (id: string) =>
        setFolded((prev) => {
            const next = new Set(prev);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            placement="center"
            title={`${plan.title} – ${plan.steps.length} ${plan.steps.length === 1 ? 'Step' : 'Steps'}`}
            className={styles.modal}
        >
            <div className={styles.body}>
                <ol className={styles.steps}>
                    {plan.steps.map((step) => {
                        const isOpen = !folded.has(step.id);

                        return (
                            <li key={step.id} className={styles.step}>
                                {step.description ? (
                                    <button
                                        type="button"
                                        className={styles.stepRow}
                                        aria-expanded={isOpen}
                                        onClick={() => toggleStep(step.id)}
                                    >
                                        <span className={styles.stepLabel}>{step.label}</span>
                                        <Icon
                                            name="chevron-down"
                                            className={classNames(
                                                styles.stepChevron,
                                                isOpen && styles.stepChevronOpen,
                                            )}
                                        />
                                    </button>
                                ) : (
                                    <span
                                        className={classNames(styles.stepRow, styles.stepRowStatic)}
                                    >
                                        <span className={styles.stepLabel}>{step.label}</span>
                                    </span>
                                )}
                                {step.description && (
                                    <div
                                        className={classNames(
                                            styles.fold,
                                            isOpen && styles.foldOpen,
                                        )}
                                        inert={!isOpen}
                                    >
                                        <div className={styles.foldInner}>
                                            <p className={styles.stepDetail}>{step.description}</p>
                                        </div>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ol>
                {plan.decisions.length > 0 && (
                    <ul className={styles.decisions}>
                        {plan.decisions.map((decision) => (
                            <DecisionRow
                                key={decision.id}
                                decision={decision}
                                plan={plan}
                                onSwitch={onSwitch}
                            />
                        ))}
                    </ul>
                )}
                <PlanMovedNote plan={plan} />
                <p className={styles.notice} role="status">
                    {plan.notice}
                </p>
            </div>
            <div className={styles.proceed}>
                <p className={styles.proceedLabel}>Start building?</p>
                <div className={styles.proceedActions}>
                    <Button variant="bordered" onClick={onCancel} disabled={!!plan.switching}>
                        Cancel
                    </Button>
                    <Button variant="dark" onClick={onApprove} disabled={!!plan.switching}>
                        Approve
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default PlanModal;
