'use client';

import classNames from 'classnames';
import { useState } from 'react';

import { useModel } from './ExploreContext';
import { TermLink } from './ExploreLink';
import { count } from './format';
import styles from './ValueTree.module.scss';

import type { MemberTree } from '@/lib/graphExplorer/model';

/** The most matches the filter lists. */
const HIT_LIMIT = 60;

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
    const needle = filter.trim().toLowerCase();

    const hits =
        needle === ''
            ? []
            : model.members(listId).filter((id) => {
                  const node = model.node(id);
                  return [
                      model.label(id),
                      id,
                      ...(node?.classification_code ?? []),
                      ...(node?.alternate_name ?? []),
                  ].some((text) => text.toLowerCase().includes(needle));
              });

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
            {needle === '' ? (
                <ul className={styles.list}>
                    {model.memberTree(listId).map((node) => (
                        <Branch key={node.id} node={node} lensDataset={lensDataset} />
                    ))}
                </ul>
            ) : hits.length === 0 ? (
                <p className={styles.note} role="status">
                    No value matches “{filter.trim()}”.
                </p>
            ) : (
                <>
                    <ul className={styles.list}>
                        {hits.slice(0, HIT_LIMIT).map((id) => (
                            <li key={id} className={styles.leaf}>
                                <Head id={id} lensDataset={lensDataset} />
                            </li>
                        ))}
                    </ul>
                    {hits.length > HIT_LIMIT && (
                        <p className={styles.note} role="status">
                            The first {HIT_LIMIT} of {count(hits.length)}. Type more to narrow.
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default ValueTree;
