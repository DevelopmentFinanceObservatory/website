import classNames from 'classnames';

import styles from './UsageMeter.module.scss';

type UsageMeterProps = {
    // Calls counted so far in the period. Refused calls count too, so this
    // can exceed `limit`; the bar stops at full.
    used: number;
    limit: number;
    // Read out with the numbers, for example "MCP calls today".
    label: string;
    className?: string;
};

/**
 * A thermometer: a bar filled to `used / limit`, with the count above it.
 * It turns red at the limit.
 */
const UsageMeter = ({ used, limit, label, className }: UsageMeterProps) => {
    const shown = Math.min(used, limit);
    const ratio = limit > 0 ? shown / limit : 1;
    const full = used >= limit;

    return (
        <div className={classNames(styles.meter, full && styles.full, className)}>
            <span className={styles.count} aria-hidden>
                {used.toLocaleString('en-GB')}
            </span>
            <div
                className={styles.track}
                role="meter"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={limit}
                aria-valuenow={shown}
                aria-valuetext={`${used.toLocaleString('en-GB')} of ${limit.toLocaleString('en-GB')}`}
            >
                <span className={styles.fill} style={{ width: `${ratio * 100}%` }} />
            </div>
        </div>
    );
};

export default UsageMeter;
