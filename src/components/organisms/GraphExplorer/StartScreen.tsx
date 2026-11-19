'use client';

import { useState } from 'react';

import { useModel } from './ExploreContext';
import { ExploreLink, OriginTag } from './ExploreLink';
import { ListToggle, useListOrigins } from './ListToggle';
import { plural } from '@/lib/graphExplorer/counts';
import styles from './StartScreen.module.scss';

import { datasetsByUse, listHead } from '@/lib/graphExplorer/lists';

/**
 * The start screen over the scoped model: the datasets with their StatVar
 * counts, most StatVars first, the kinds of thing their figures are about
 * with how many datasets use each, and one way to list every property the
 * DFO declares. Each long list shows its first entries and "All N", and
 * each entry from outside the DFO carries its origin tag.
 */
const StartScreen = () => {
    const model = useModel();
    const origins = useListOrigins(model);
    const [datasetsOpen, setDatasetsOpen] = useState(false);
    const [kindsOpen, setKindsOpen] = useState(false);
    const propertyCount = model.dfoProperties().length;
    const datasets = listHead(datasetsByUse(model), { open: datasetsOpen });
    const kinds = listHead(model.populationTypes(), { open: kindsOpen });

    return (
        <div className={styles.start}>
            <div className={styles.columns}>
                <section className={styles.section} aria-labelledby="start-datasets">
                    <h2 id="start-datasets" className={styles.label}>
                        Start from a dataset
                    </h2>
                    <ul className={styles.rows}>
                        {datasets.shown.map((dataset) => (
                            <li key={dataset.ref} className={styles.row}>
                                <span className={styles.entry}>
                                    <ExploreLink
                                        view={{ kind: 'dataset', id: dataset.ref }}
                                        className={styles.name}
                                    >
                                        {model.label(dataset.ref)}
                                    </ExploreLink>
                                    <OriginTag declaredBy={origins.dataset(dataset)} dataset />
                                </span>
                                <span className={styles.figure}>
                                    {plural(dataset.stat_var_count, 'StatVar')}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <ListToggle
                        head={datasets}
                        open={datasetsOpen}
                        onToggle={() => setDatasetsOpen((open) => !open)}
                    />
                </section>
                <div className={styles.stack}>
                    <section className={styles.section} aria-labelledby="start-kinds">
                        <h2 id="start-kinds" className={styles.label}>
                            Start from a kind of thing
                        </h2>
                        <ul className={styles.rows}>
                            {kinds.shown.map((use) => (
                                <li key={use.classId} className={styles.row}>
                                    <span className={styles.entry}>
                                        <ExploreLink
                                            view={{ kind: 'node', id: use.classId }}
                                            className={styles.name}
                                        >
                                            {model.label(use.classId)}
                                        </ExploreLink>
                                        <OriginTag declaredBy={origins.term(use.classId)} />
                                    </span>
                                    <span className={styles.figure}>
                                        {plural(use.datasets, 'dataset')}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <ListToggle
                            head={kinds}
                            open={kindsOpen}
                            onToggle={() => setKindsOpen((open) => !open)}
                        />
                    </section>
                    <section className={styles.section} aria-labelledby="start-properties">
                        <h2 id="start-properties" className={styles.label}>
                            Start from the properties
                        </h2>
                        <ul className={styles.rows}>
                            <li className={styles.row}>
                                <ExploreLink
                                    view={{ kind: 'list', scope: { kind: 'dfo' } }}
                                    className={styles.name}
                                >
                                    Every DFO property
                                </ExploreLink>
                                <span className={styles.figure}>
                                    {plural(propertyCount, 'property', 'properties')}
                                </span>
                            </li>
                        </ul>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default StartScreen;
