'use client';

import { useId, useState } from 'react';

import { useFullModel, useModel } from './ExploreContext';
import { OriginTag } from './ExploreLink';
import { ListToggle, useListOrigins } from './ListToggle';
import styles from './ShowPills.module.scss';

import { datasetsByUse, listHead } from '@/lib/graphExplorer/lists';
import type { DatasetFilter } from '@/lib/graphExplorer/model';
import type { ProvenanceUsage } from '@/lib/graphExplorer/wire';

type ShowPillsProps = {
    value: DatasetFilter;
    onChange: (next: DatasetFilter) => void;
    /** Offers "All datasets", every dataset side by side. */
    withAll?: boolean;
};

const same = (a: DatasetFilter, b: DatasetFilter): boolean =>
    a.kind === b.kind && (a.kind !== 'dataset' || (b.kind === 'dataset' && a.id === b.id));

/**
 * The dataset filter: Everything, one pill per dataset of the scoped model,
 * most StatVars first, and All datasets. A long list shows its first pills
 * and "All N", and the chosen dataset's pill stays on show, read from the
 * full model when the switches leave its origin out.
 */
const ShowPills = ({ value, onChange, withAll = false }: ShowPillsProps) => {
    const model = useModel();
    const full = useFullModel();
    const origins = useListOrigins(model);
    const labelId = useId();
    const [open, setOpen] = useState(false);

    const chosen = value.kind === 'dataset' ? value.id : null;
    const outsideScope =
        chosen === null || model.dataset(chosen) ? undefined : full.dataset(chosen);
    const datasets: readonly ProvenanceUsage[] =
        outsideScope === undefined ? datasetsByUse(model) : [...datasetsByUse(model), outsideScope];
    const head = listHead(datasets, { open, keep: (dataset) => dataset.ref === chosen });

    const choices: {
        key: string;
        label: string;
        origin: string | null;
        filter: DatasetFilter;
    }[] = [
        { key: 'none', label: 'Everything', origin: null, filter: { kind: 'none' } },
        ...head.shown.map((dataset) => ({
            key: dataset.ref,
            label: full.label(dataset.ref),
            origin: origins.dataset(dataset),
            filter: { kind: 'dataset', id: dataset.ref } as const,
        })),
        ...(withAll
            ? [
                  {
                      key: 'all',
                      label: 'All datasets',
                      origin: null,
                      filter: { kind: 'all' } as const,
                  },
              ]
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
                        <OriginTag declaredBy={choice.origin} dataset />
                    </button>
                ))}
            </div>
            <ListToggle head={head} open={open} onToggle={() => setOpen((was) => !was)} />
        </div>
    );
};

export default ShowPills;
