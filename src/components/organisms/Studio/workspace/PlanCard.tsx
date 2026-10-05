'use client';

import classNames from 'classnames';
import { useState } from 'react';

import styles from './PlanCard.module.scss';
import PlanModal from './PlanModal';
import type { ChatState } from '../hooks/useChat';

import Button from '@/components/atoms/Button/Button';

// How many steps the preview shows before "View Plan" takes over.
const PREVIEW_STEPS = 3;

type PlanCardProps = {
    plan: NonNullable<ChatState['plan']>;
    onApprove: () => void;
    onCancel: () => void;
};

/**
 * The research-plan review in the chat (design: "Proposed Research Plan"):
 * a preview — the title with the step count, the first steps on the dot
 * rail (the last one fading out), "View Plan" to the full plan in a modal —
 * then the "Start building?" bar with Cancel and Approve. Changes still
 * travel through the chat input below (ChatPanel repurposes it as "Propose
 * changes or ask a follow up…" while the plan is pending, wired to the
 * amend decision).
 */
const PlanCard = ({ plan, onApprove, onCancel }: PlanCardProps) => {
    const [open, setOpen] = useState(false);
    const preview = plan.steps.slice(0, PREVIEW_STEPS);
    const more = plan.steps.length > PREVIEW_STEPS;

    return (
        <div className={styles.planWrap}>
            <section className={styles.plan} aria-label="Proposed research plan">
                <header className={styles.head}>
                    <p className={styles.title}>
                        {plan.title}
                        {plan.version > 1 && (
                            <span className={styles.version}> v{plan.version}</span>
                        )}
                        <span className={styles.count}>
                            {' – '}
                            {plan.steps.length} {plan.steps.length === 1 ? 'Step' : 'Steps'}
                        </span>
                    </p>
                    <button type="button" className={styles.view} onClick={() => setOpen(true)}>
                        View Plan
                    </button>
                </header>
                <ol className={classNames(styles.steps, more && styles.stepsMore)}>
                    {preview.map((step) => (
                        <li key={step.id} className={styles.step}>
                            <span className={styles.stepLabel}>{step.label}</span>
                        </li>
                    ))}
                </ol>
            </section>
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
            <PlanModal
                plan={plan}
                open={open}
                onOpenChange={setOpen}
                onApprove={() => {
                    setOpen(false);
                    onApprove();
                }}
                onCancel={() => {
                    setOpen(false);
                    onCancel();
                }}
            />
        </div>
    );
};

export default PlanCard;
