'use client';

import { useId } from 'react';

import { useModel } from './ExploreContext';
import styles from './ShowPills.module.scss';

import type { DatasetFilter } from '@/lib/graphExplorer/model';

type ShowPillsProps = {
    value: DatasetFilter;
    onChange: (next: DatasetFilter) => void;
    /** Offers "All datasets", every dataset side by side. */
    withAll?: boolean;
};

const same = (a: DatasetFilter, b: DatasetFilter): boolean =>
    a.kind === b.kind && (a.kind !== 'dataset' || (b.kind === 'dataset' && a.id === b.id));

/** The dataset filter: Everything, one pill per dataset, and All datasets. */
const ShowPills = ({ value, onChange, withAll = false }: ShowPillsProps) => {
    const model = useModel();
    const labelId = useId();
    const choices: { key: string; label: string; filter: DatasetFilter }[] = [
        { key: 'none', label: 'Everything', filter: { kind: 'none' } },
        ...model.datasets.map((dataset) => ({
            key: dataset.dcid,
            label: model.label(dataset.dcid),
            filter: { kind: 'dataset', id: dataset.dcid } as const,
        })),
        ...(withAll
            ? [{ key: 'all', label: 'All datasets', filter: { kind: 'all' } as const }]
            : []),
    ];

    return (
        <div className={styles.show}>
            <span className={styles.label} id={labelId}>
                Show
            </span>
            <div className={styles.pills} role="group" aria-labelledby={labelId}>
                {choices.map((choice) => (
                    <button
                        key={choice.key}
                        type="button"
                        className={styles.pill}
                        aria-pressed={same(value, choice.filter)}
                        onClick={() => onChange(choice.filter)}
                    >
                        {choice.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ShowPills;
