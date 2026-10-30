'use client';

import classNames from 'classnames';

import styles from './PlanApproveBar.module.scss';

import Button from '@/components/atoms/Button/Button';

/** "Start building?" with Cancel and Approve, under the plan card and in the
 *  full plan's footer. While a switch is in flight it says the plan is
 *  updating and both buttons wait. */
export const PlanApproveBar = ({
    busy,
    onApprove,
    onCancel,
    className,
}: {
    busy: boolean;
    onApprove?: () => void;
    onCancel?: () => void;
    className?: string;
}) => (
    <div className={classNames(styles.bar, className)}>
        <p className={styles.label}>{busy ? 'Updating the plan…' : 'Start building?'}</p>
        <div className={styles.actions}>
            <Button variant="plain" onClick={onCancel} disabled={busy}>
                Cancel
            </Button>
            <Button variant="dark" onClick={onApprove} disabled={busy}>
                Approve
            </Button>
        </div>
    </div>
);
