'use client';

import { useState } from 'react';

import styles from './ApprovedPlanPill.module.scss';
import PlanModal from './PlanModal';

import { approvedView, stepCount, type ApprovedPlan } from '@/lib/studio/plan';

/** The approved plan under the answer it produced, in the WidgetChips chip
 *  shape: its title, the step count and what it counted. A click opens the
 *  plan read-only. */
const ApprovedPlanPill = ({ plan }: { plan: ApprovedPlan }) => {
    const [open, setOpen] = useState(false);
    const view = approvedView(plan);
    const counted = view.choices.map((choice) => choice.value).join('; ');

    return (
        <>
            <button
                type="button"
                className={styles.pill}
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}
            >
                <span className={styles.icon} aria-hidden>
                    <i />
                    <i />
                    <i />
                </span>
                <span className={styles.body}>
                    <span className={styles.title}>{view.title}</span>
                    <span className={styles.sub}>
                        {stepCount(view.steps.length)}
                        {counted && ` / counted as ${counted}`}
                    </span>
                </span>
                <span className={styles.state}>Approved plan</span>
            </button>
            <PlanModal view={view} open={open} onOpenChange={setOpen} />
        </>
    );
};

export default ApprovedPlanPill;
