import classNames from 'classnames';
import { type RefObject, useEffect, useRef, useState } from 'react';

import styles from './PromptDock.module.scss';
import { PlanCaveats, PlanLedger } from '../../../workspace/PlanLedger';
import PlanModal from '../../../workspace/PlanModal';

import Icon from '@/components/atoms/Icon/Icon';
import { type PlanState, planView, stepCount, switchOutcome } from '@/lib/studio/plan';

const eyebrowOf = (version: number, steps: number) =>
    `Research plan${version > 1 ? ` v${version}` : ''} / ${stepCount(steps)}`;

/** Whether more of the element's content lies below its foot, kept on
 *  scroll and on resize. */
const useMoreBelow = (ref: RefObject<HTMLElement | null>, shown: boolean) => {
    const [more, setMore] = useState(false);

    useEffect(() => {
        const el = ref.current;

        if (!el) {
            return;
        }

        const measure = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
        const observer = new ResizeObserver(measure);

        observer.observe(el);
        el.addEventListener('scroll', measure, { passive: true });

        return () => {
            observer.disconnect();
            el.removeEventListener('scroll', measure);
        };
    }, [ref, shown]);

    return shown && more;
};

/**
 * The waiting plan above the prompt: open, its eyebrow and fold chevron,
 * then the title, the summary, the ledger with its `Change` links and what
 * to keep in mind, which scroll, and `View full plan` below them; folded,
 * one row that opens it.
 */
const PlanSheet = ({
    plan,
    open,
    onFold,
    onOpen,
    onSwitch,
    onApprove,
    onCancel,
    announce,
}: {
    plan: PlanState;
    open: boolean;
    onFold: () => void;
    onOpen: () => void;
    /** Left out for a guest behind the wall, who cannot amend. */
    onSwitch?: (choiceId: string, optionId: string) => void;
    onApprove: () => void;
    onCancel: () => void;
    /** Speaks through the shell's live region. */
    announce: (text: string) => void;
}) => {
    const [full, setFull] = useState(false);
    const body = useRef<HTMLDivElement>(null);
    const more = useMoreBelow(body, open);
    const view = planView(plan);
    const eyebrow = eyebrowOf(view.version, view.steps.length);
    // What a switch changed, said once when the fresh plan arrives.
    const outcome = switchOutcome(view, plan).join(' ');

    useEffect(() => {
        if (outcome) {
            announce(outcome);
        }
    }, [outcome, announce]);

    return (
        // The open body is the `Research plan` region; a second landmark of
        // that name around it would repeat it.
        <section className={classNames(styles.sheet, styles.planSheet)}>
            {open ? (
                <>
                    <div className={classNames(styles.sheetHead, styles.headRow)}>
                        <p className={styles.headLabel}>{eyebrow}</p>
                        <button
                            type="button"
                            className={styles.iconBtn}
                            aria-label="Fold the plan"
                            aria-expanded="true"
                            data-dock="plan-fold"
                            onClick={onFold}
                        >
                            <Icon name="chevron-down" />
                        </button>
                    </div>
                    <div
                        ref={body}
                        className={classNames(styles.scroll, styles.planBody)}
                        data-more-below={more || undefined}
                        role="region"
                        aria-label="Research plan"
                        tabIndex={0}
                    >
                        <p className={styles.planTitle}>{view.title}</p>
                        {view.summary && <p className={styles.planSummary}>{view.summary}</p>}
                        <PlanLedger
                            view={view}
                            plan={plan}
                            onSwitch={onSwitch}
                            columns
                            className={styles.planLedger}
                        />
                        <PlanCaveats caveats={view.caveats} className={styles.planCaveats} />
                    </div>
                    <div className={styles.planFoot}>
                        <button
                            type="button"
                            className={styles.planFull}
                            aria-haspopup="dialog"
                            onClick={() => setFull(true)}
                        >
                            View full plan
                        </button>
                    </div>
                </>
            ) : (
                <button
                    type="button"
                    className={styles.planFolded}
                    aria-expanded="false"
                    title={view.title}
                    data-dock="plan-open"
                    onClick={onOpen}
                >
                    <span className={styles.headLabel}>{eyebrow}</span>
                    <span className={styles.rowMeta} aria-hidden>
                        ·
                    </span>
                    <span className={styles.planFoldedTitle}>{view.title}</span>
                    <Icon name="chevron-down" className={styles.chevronUp} />
                </button>
            )}
            <PlanModal
                view={view}
                plan={plan}
                open={full}
                onOpenChange={setFull}
                onSwitch={onSwitch}
                onApprove={() => {
                    setFull(false);
                    onApprove();
                }}
                onCancel={() => {
                    setFull(false);
                    onCancel();
                }}
            />
        </section>
    );
};

export default PlanSheet;
