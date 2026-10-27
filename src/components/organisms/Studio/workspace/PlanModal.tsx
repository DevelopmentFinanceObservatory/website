'use client';

import classNames from 'classnames';
import { useState } from 'react';

import { PlanLedger, PlanMeta } from './PlanLedger';
import styles from './PlanModal.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import type { PlanState, PlanView } from '@/lib/studio/plan';

type PlanModalProps = {
    view: PlanView;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // The plan awaiting review, with its answers. An approved plan
    // (read-only) passes none of these.
    plan?: PlanState;
    onApprove?: () => void;
    onCancel?: () => void;
    // Switches a scope choice to another option. Left out where the viewer
    // cannot change the plan (a guest).
    onSwitch?: (choiceId: string, optionId: string) => void;
};

/** Every step on the dot rail, folded to its label. The step that gives the
 *  answer starts open and carries a filled dot. */
const Steps = ({ view }: { view: PlanView }) => {
    const [openKeys, setOpenKeys] = useState(
        () => new Set(view.steps.filter((step) => step.givesAnswer).map((step) => step.key)),
    );

    const toggle = (key: string) =>
        setOpenKeys((prev) => {
            const next = new Set(prev);

            if (!next.delete(key)) {
                next.add(key);
            }

            return next;
        });

    return (
        <ol className={styles.rail}>
            {view.steps.map((step) => {
                const isOpen = openKeys.has(step.key);
                const label = (
                    <span className={styles.stepLabel}>
                        {step.givesAnswer && <span className={styles.kind}>Gives the answer</span>}
                        {step.label}
                    </span>
                );

                return (
                    <li
                        key={step.key}
                        className={classNames(styles.step, step.givesAnswer && styles.stepAnswer)}
                    >
                        {step.description ? (
                            <button
                                type="button"
                                className={styles.stepRow}
                                aria-expanded={isOpen}
                                onClick={() => toggle(step.key)}
                            >
                                {label}
                                <Icon
                                    name="chevron-down"
                                    className={classNames(
                                        styles.chevron,
                                        isOpen && styles.chevronOpen,
                                    )}
                                />
                            </button>
                        ) : (
                            <span className={styles.stepRow}>{label}</span>
                        )}
                        {step.description && isOpen && (
                            <p className={styles.stepDetail}>{step.description}</p>
                        )}
                    </li>
                );
            })}
        </ol>
    );
};

/**
 * The full plan: what it counts, the scope choices (switchable on a live
 * plan), the steps folded to labels with the answer step open, then the
 * planner's other decisions. A live plan's footer asks to approve; an
 * approved plan opens read-only from the pill under its answer.
 */
const PlanModal = ({
    view,
    open,
    onOpenChange,
    plan,
    onApprove,
    onCancel,
    onSwitch,
}: PlanModalProps) => {
    const readOnly = !plan;
    const ended = plan && !plan.live;
    const busy = !!plan?.switching;
    const answerKey = view.steps.find((step) => step.givesAnswer)?.key;

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            placement="center"
            title={view.title}
            className={styles.modal}
            footer={
                readOnly || ended ? (
                    <div className={styles.proceed}>
                        <p className={styles.note}>
                            {readOnly
                                ? 'Approved. Ask a follow up to change the scope.'
                                : 'Ask again to change the plan.'}
                        </p>
                        <Button variant="bordered" onClick={() => onOpenChange(false)}>
                            Close
                        </Button>
                    </div>
                ) : (
                    <div className={styles.proceed}>
                        <p className={styles.proceedLabel}>
                            {busy ? 'Updating the plan…' : 'Start building?'}
                        </p>
                        <div className={styles.proceedActions}>
                            <Button variant="plain" onClick={onCancel} disabled={busy}>
                                Cancel
                            </Button>
                            <Button variant="dark" onClick={onApprove} disabled={busy}>
                                Approve
                            </Button>
                        </div>
                    </div>
                )
            }
        >
            <div className={styles.body}>
                <PlanMeta view={view} approved={readOnly} />
                {view.summary && <p className={styles.summary}>{view.summary}</p>}
                <PlanLedger view={view} plan={plan} onSwitch={onSwitch} className={styles.ledger} />
                {view.caveats.length > 0 && (
                    <section className={styles.section}>
                        <p className={styles.sectionHead}>Keep in mind</p>
                        <ul className={styles.others}>
                            {view.caveats.map((caveat) => (
                                <li key={caveat}>{caveat}</li>
                            ))}
                        </ul>
                    </section>
                )}
                <section className={styles.section}>
                    <p className={styles.sectionHead}>Steps</p>
                    {/* A switch can move the answer step; the open set
                        starts again from the new one. */}
                    <Steps key={answerKey} view={view} />
                </section>
                {view.others.length > 0 && (
                    <section className={styles.section}>
                        <p className={styles.sectionHead}>Other choices the plan made</p>
                        <ul className={styles.others}>
                            {view.others.map((other) => (
                                <li key={other.key}>
                                    {other.question}: <b>{other.chosen}</b>
                                    {other.reason ? `. ${other.reason}` : ''}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </Modal>
    );
};

export default PlanModal;
