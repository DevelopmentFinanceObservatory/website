import classNames from 'classnames';

import styles from './StatusTracker.module.scss';
import type { ServiceStatus } from './statusData';

import Icon from '@/components/atoms/Icon/Icon';

// The status chip: a small square (or a check for "Resolved") and the
// label on the status colour.
const StatusChip = ({
    status,
    label,
    check,
}: {
    status: ServiceStatus;
    label: string;
    check?: boolean;
}) => (
    <span className={classNames(styles.chip, styles[`chip_${status}`])}>
        {check ? (
            <Icon name="check" className={styles.chipCheck} />
        ) : (
            <span className={styles.chipDot} aria-hidden="true" />
        )}
        {label}
    </span>
);

export default StatusChip;
