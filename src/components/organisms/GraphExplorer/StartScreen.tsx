'use client';

import { useMemo } from 'react';

import { useModel } from './ExploreContext';
import { ExploreLink } from './ExploreLink';
import { plural } from '@/lib/graphExplorer/counts';
import styles from './StartScreen.module.scss';

/**
 * The start screen: the datasets with their StatVar counts, the kinds of
 * thing their figures are about with how many datasets use each, and one way
 * to list every property the instance declares.
 */
const StartScreen = () => {
    const model = useModel();
    const propertyCount = useMemo(
        () => model.scopedList({ kind: 'instance' }, { kind: 'none' }).total,
        [model],
    );

    return (
        <div className={styles.start}>
            <div className={styles.columns}>
                <section className={styles.section} aria-labelledby="start-datasets">
                    <h2 id="start-datasets" className={styles.label}>
                        Start from a dataset
                    </h2>
                    <ul className={styles.rows}>
                        {model.datasets.map((dataset) => (
                            <li key={dataset.dcid} className={styles.row}>
                                <ExploreLink
                                    view={{ kind: 'dataset', id: dataset.dcid }}
                                    className={styles.name}
                                >
                                    {model.label(dataset.dcid)}
                                </ExploreLink>
                                <span className={styles.figure}>
                                    {plural(dataset.stat_var_count, 'StatVar')}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
                <div className={styles.stack}>
                    <section className={styles.section} aria-labelledby="start-kinds">
                        <h2 id="start-kinds" className={styles.label}>
                            Start from a kind of thing
                        </h2>
                        <ul className={styles.rows}>
                            {model.populationTypes().map((use) => (
                                <li key={use.classId} className={styles.row}>
                                    <ExploreLink
                                        view={{ kind: 'node', id: use.classId }}
                                        className={styles.name}
                                    >
                                        {model.label(use.classId)}
                                    </ExploreLink>
                                    <span className={styles.figure}>
                                        {plural(use.datasets, 'dataset')}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                    <section className={styles.section} aria-labelledby="start-properties">
                        <h2 id="start-properties" className={styles.label}>
                            Start from the properties
                        </h2>
                        <ul className={styles.rows}>
                            <li className={styles.row}>
                                <ExploreLink
                                    view={{ kind: 'list', scope: { kind: 'instance' } }}
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
