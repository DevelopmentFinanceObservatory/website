'use client';

import { useMemo } from 'react';

import { useModel } from './ExploreContext';
import { ExploreLink } from './ExploreLink';
import { count, plural } from './format';
import styles from './StartScreen.module.scss';
import type { Loadable } from './useExplorerData';

import Button from '@/components/atoms/Button/Button';
import Spinner from '@/components/atoms/Spinner/Spinner';
import { waitText } from '@/lib/graphExplorer/load';
import type { OntologyTerms } from '@/lib/graphExplorer/wire';

type StartScreenProps = {
    /** Whether the base switch is on: the URL's `base` parameter. */
    base: boolean;
    terms: Loadable<OntologyTerms> | null;
    onBase: (on: boolean) => void;
    onRetryTerms: () => void;
};

/** What the base switch's terms list is doing, in one line. */
const TermsNote = ({ terms, onRetry }: { terms: Loadable<OntologyTerms>; onRetry: () => void }) => {
    if (terms.status === 'loading') {
        return (
            <p className={styles.note} role="status">
                <Spinner size={14} label="Loading" />
                {terms.retryInMs === null
                    ? 'Loading base Data Commons terms.'
                    : waitText(terms.retryInMs)}
            </p>
        );
    }
    if (terms.status === 'failed') {
        return (
            <div className={styles.note} role="alert">
                <span>{terms.message}</span>
                <Button onClick={onRetry}>Try Again</Button>
            </div>
        );
    }
    return (
        <p className={styles.note}>
            Search also covers {count(terms.value.terms.length)} classes and properties on the
            graph, DFO results first.
        </p>
    );
};

/**
 * The start screen: the datasets with their StatVar counts, the kinds of
 * thing their figures are about with how many datasets use each, one way to
 * list every property the instance declares, and the base search switch.
 */
const StartScreen = ({ base, terms, onBase, onRetryTerms }: StartScreenProps) => {
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
            <div className={styles.base}>
                <label className={styles.switch}>
                    <input
                        type="checkbox"
                        checked={base}
                        onChange={(event) => onBase(event.target.checked)}
                    />
                    Include base Data Commons in search
                </label>
                {base && terms && <TermsNote terms={terms} onRetry={onRetryTerms} />}
            </div>
        </div>
    );
};

export default StartScreen;
