'use client';

import classNames from 'classnames';
import { useState } from 'react';

import styles from './PlanCard.module.scss';
import { PlanLedger, PlanMeta } from './PlanLedger';
import PlanModal from './PlanModal';
import type { ChatState } from '../hooks/useChat';

import Button from '@/components/atoms/Button/Button';
import { answerStepOf, planView, stepCount } from '@/lib/studio/plan';

type PlanCardProps = {
    plan: NonNullable<ChatState['plan']>;
    onApprove: () => void;
    onCancel: () => void;
    onSwitch?: (choiceId: string, optionId: string) => void;
};

/**
 * The research plan awaiting review, in the chat foot: the title and its
 * summary, the scope choices ("Counted as", each switchable in place), the
 * step that gives the answer, and "View full plan" to every step in a
 * modal. Then the "Start building?" bar with Cancel and Approve. Changes
 * still travel through the chat input below (ChatPanel repurposes it as
 * "Propose changes or ask a follow up…" while the plan is pending, wired to
 * the amend decision).
 *
 * The card's height follows the number of scope choices.
 * While a switch is in flight the steps line dims and the bar waits.
 */
const PlanCard = ({ plan, onApprove, onCancel, onSwitch }: PlanCardProps) => {
    const [open, setOpen] = useState(false);
    const view = planView(plan);
    const answer = answerStepOf(view);
    const busy = !!plan.switching;
    const steps = stepCount(view.steps.length);

    return (
        <div className={styles.planWrap}>
            <section className={styles.plan} aria-label="Proposed research plan">
                <header className={styles.head}>
                    <PlanMeta view={view} />
                    <p className={styles.title}>{view.title}</p>
                    {view.summary && <p className={styles.summary}>{view.summary}</p>}
                </header>
                <PlanLedger view={view} plan={plan} onSwitch={onSwitch} />
                <div className={classNames(styles.stepsLine, busy && styles.dim)}>
                    {answer && (
                        <>
                            <p className={styles.stepsTop}>
                                {view.steps.length > 1 ? `${steps}, ending in` : 'One step'}
                            </p>
                            <p className={styles.answer}>
                                <span className={styles.dot} />
                                <span className={styles.answerLabel}>{answer.label}</span>
                            </p>
                        </>
                    )}
                    {plan.changed.length > 0 && (
                        <p className={styles.updated}>Steps updated to match.</p>
                    )}
                    <Button
                        variant="bordered"
                        full
                        className={styles.viewPlan}
                        disabled={busy}
                        onClick={() => setOpen(true)}
                    >
                        {`View full plan (${steps})`}
                    </Button>
                </div>
            </section>
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
            <PlanModal
                view={view}
                plan={plan}
                open={open}
                onOpenChange={setOpen}
                onSwitch={onSwitch}
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
