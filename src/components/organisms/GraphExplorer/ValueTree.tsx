'use client';

import classNames from 'classnames';
import { useState } from 'react';

import { useModel } from './ExploreContext';
import { TermLink } from './ExploreLink';
import { count } from './format';
import styles from './ValueTree.module.scss';

import { searchMembers, type MemberTree } from '@/lib/graphExplorer/model';

/** A value's code and its link, dimmed when the filter's dataset does not use it. */
const Head = ({ id, lensDataset }: { id: string; lensDataset: string | null }) => {
    const model = useModel();
    const unused = lensDataset !== null && model.usageIn(id, lensDataset) === 0;

    return (
        <>
            <span className={styles.code}>{model.node(id)?.classification_code[0] ?? ''}</span>
            <span className={classNames(styles.term, unused && styles.dim)}>
                <TermLink id={id} />
            </span>
        </>
    );
};

const Branch = ({ node, lensDataset }: { node: MemberTree; lensDataset: string | null }) => (
    <li>
        {node.children.length === 0 ? (
            <div className={styles.leaf}>
                <Head id={node.id} lensDataset={lensDataset} />
            </div>
        ) : (
            <details>
                <summary className={styles.summary}>
                    <Head id={node.id} lensDataset={lensDataset} />
                    <span className={styles.count}>{count(node.children.length)} narrower</span>
                </summary>
                <ul className={styles.children}>
                    {node.children.map((child) => (
                        <Branch key={child.id} node={child} lensDataset={lensDataset} />
                    ))}
                </ul>
            </details>
        )}
    </li>
);

type ValueTreeProps = {
    listId: string;
    /** The dataset of the filter, whose unused values are dimmed; null for none. */
    lensDataset: string | null;
};

/**
 * A value list's members as a tree by narrower values, each branch closed
 * until opened, with a box that filters by name, code or other name into a
 * flat list of matches.
 */
const ValueTree = ({ listId, lensDataset }: ValueTreeProps) => {
    const model = useModel();
    const [filter, setFilter] = useState('');
    const blank = filter.trim() === '';
    const { hits, total } = searchMembers(model, listId, filter);

    return (
        <div className={styles.tree}>
            <input
                type="search"
                className={styles.filter}
                placeholder="Filter by name or code"
                aria-label="Filter values by name or code"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
            />
            {blank ? (
                <ul className={styles.list}>
                    {model.memberTree(listId).map((node) => (
                        <Branch key={node.id} node={node} lensDataset={lensDataset} />
                    ))}
                </ul>
            ) : total === 0 ? (
                <p className={styles.note} role="status">
                    No value matches “{filter.trim()}”.
                </p>
            ) : (
                <>
                    <ul className={styles.list}>
                        {hits.map((id) => (
                            <li key={id} className={styles.leaf}>
                                <Head id={id} lensDataset={lensDataset} />
                            </li>
                        ))}
                    </ul>
                    {total > hits.length && (
                        <p className={styles.note} role="status">
                            The first {count(hits.length)} of {count(total)}. Type more to narrow.
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default ValueTree;
