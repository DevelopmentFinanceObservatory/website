'use client';

import classNames from 'classnames';
import { useState } from 'react';

import styles from './PlanModal.module.scss';
import type { ChatState } from '../hooks/useChat';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';

type PlanModalProps = {
    plan: NonNullable<ChatState['plan']>;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApprove: () => void;
    onCancel: () => void;
};

/**
 * The full plan (design: "Proposed Research Plan – N Steps" modal): every
 * step on the dot rail with its description unfolded (a chevron folds it),
 * the agent's decisions under them, and the same "Start building?" bar
 * with Cancel and Approve pinned to the bottom.
 */
const PlanModal = ({ plan, open, onOpenChange, onApprove, onCancel }: PlanModalProps) => {
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
                            <li key={decision.id} className={styles.decision}>
                                {decision.question} — <strong>{decision.chosen}</strong>
                                {decision.reason ? ` (${decision.reason})` : ''}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className={styles.proceed}>
                <p className={styles.proceedLabel}>Start building?</p>
                <div className={styles.proceedActions}>
                    <Button variant="bordered" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button variant="dark" onClick={onApprove}>
                        Approve
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default PlanModal;
