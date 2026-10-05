'use client';

import classNames from 'classnames';
import { useState } from 'react';

import StatusChip from './StatusChip';
import styles from './StatusTracker.module.scss';
import { type Service, STATUS_LABELS } from './statusData';

import Icon from '@/components/atoms/Icon/Icon';
import { revealIndex } from '@/hooks/useReveal';

// One service: the hairline row (name, uptime, status, chevron) opening —
// grid-rows accordion — to the 90-day strip and four stats.
const ServiceRow = ({
    service,
    index,
    defaultOpen,
}: {
    service: Service;
    index: number;
    defaultOpen?: boolean;
}) => {
    const [open, setOpen] = useState(!!defaultOpen);

    return (
        <li
            className={classNames(styles.service, open && styles.serviceOpen)}
            style={revealIndex(index)}
        >
            <button
                type="button"
                className={styles.serviceHead}
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
            >
                <span className={styles.serviceName}>{service.name}</span>
                <span className={styles.serviceMeta}>
                    <span className={styles.uptime}>{service.uptime}%</span>
                    <StatusChip status={service.status} label={STATUS_LABELS[service.status]} />
                    <Icon name="chevron-down" className={styles.chevron} />
                </span>
            </button>
            <div className={styles.serviceBody}>
                <div className={styles.serviceBodyInner}>
                    <div className={styles.stripLabels}>
                        <span>90 days ago</span>
                        <span>Today</span>
                    </div>
                    <div className={styles.strip} role="img" aria-label="Last 90 days">
                        {service.days.map((day, i) => (
                            <span key={i} className={styles.day} data-state={day} />
                        ))}
                    </div>
                    <dl className={styles.stats}>
                        {service.stats.map((stat) => (
                            <div key={stat.label} className={styles.stat}>
                                <dt className={styles.statValue}>{stat.value}</dt>
                                <dd className={styles.statLabel}>{stat.label}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </li>
    );
};

export default ServiceRow;
