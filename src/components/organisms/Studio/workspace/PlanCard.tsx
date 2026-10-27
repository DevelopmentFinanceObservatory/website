'use client';

import classNames from 'classnames';
import { useState } from 'react';

import { PlanApproveBar } from './PlanApproveBar';
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
 * step that gives the answer, what to keep in mind about the answer, and
 * "View full plan" to every step in a modal. Then the "Start building?" bar
 * with Cancel and Approve. Changes
 * still travel through the chat input below (ChatPanel repurposes it as
 * "Propose changes or ask a follow up…" while the plan is pending, wired to
 * the amend decision).
 *
 * The card's height follows the number of scope choices.
 * While a switch is in flight the steps line dims and the bar waits. A card
 * whose pause has ended (a switch ended without a fresh plan) is read-only:
 * no bar, and its rows say to ask again.
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
                                {view.steps.length > 1
                                    ? `${steps}. The answer comes from:`
                                    : 'One step'}
                            </p>
                            <p className={styles.answer}>
                                <span className={styles.dot} />
                                <span className={styles.answerLabel}>{answer.label}</span>
                            </p>
                        </>
                    )}
                    {plan.switched && <p className={styles.updated}>Steps updated to match.</p>}
                    {view.caveats.length > 0 && (
                        <div className={styles.caveats}>
                            <p className={styles.caveatsHead}>Keep in mind</p>
                            <ul className={styles.caveatList}>
                                {view.caveats.map((caveat, index) => (
                                    // Caveats are sentences with no id, and two may read alike.
                                    <li key={index}>{caveat}</li>
                                ))}
                            </ul>
                        </div>
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
            {plan.live && (
                <PlanApproveBar
                    busy={busy}
                    onApprove={onApprove}
                    onCancel={onCancel}
                    className={styles.proceed}
                />
            )}
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
