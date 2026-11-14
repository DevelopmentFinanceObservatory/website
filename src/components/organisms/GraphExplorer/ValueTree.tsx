'use client';

import classNames from 'classnames';
import { useState } from 'react';

import { useModel } from './ExploreContext';
import { TermLink } from './ExploreLink';
import { count } from '@/lib/graphExplorer/counts';
import styles from './ValueTree.module.scss';

import {
    memberFields,
    membersHaveCodes,
    openCell,
    searchMembers,
    type MemberTree,
} from '@/lib/graphExplorer/model';

/** The open properties the list's members carry, shown as columns at each row's end. */
type Fields = readonly string[];

/** A member's cell per open property, right-aligned so the columns line up at every depth. */
const Cells = ({ id, fields }: { id: string; fields: Fields }) => {
    const model = useModel();
    if (fields.length === 0) return null;

    return (
        <span className={styles.cells}>
            {fields.map((property) => (
                <span key={property} className={styles.cell} title={model.label(property)}>
                    {openCell(model, id, property, ', ')}
                </span>
            ))}
        </span>
    );
};

/**
 * A value's code, its link and its open property cells, dimmed when the
 * filter's dataset does not use it. The code is left out when no member of
 * the list has one.
 */
const Head = ({
    id,
    lensDataset,
    fields,
    codes,
    narrower = 0,
}: {
    id: string;
    lensDataset: string | null;
    fields: Fields;
    codes: boolean;
    narrower?: number;
}) => {
    const model = useModel();
    const unused = lensDataset !== null && model.usageIn(id, lensDataset) === 0;

    return (
        <>
            {codes && (
                <span className={styles.code}>{model.node(id)?.classification_code[0] ?? ''}</span>
            )}
            <span className={classNames(styles.term, unused && styles.dim)}>
                <TermLink id={id} />
            </span>
            {narrower > 0 && <span className={styles.count}>{count(narrower)} narrower</span>}
            <Cells id={id} fields={fields} />
        </>
    );
};

type BranchProps = {
    node: MemberTree;
    lensDataset: string | null;
    fields: Fields;
    codes: boolean;
};

const Branch = ({ node, lensDataset, fields, codes }: BranchProps) => (
    <li>
        {node.children.length === 0 ? (
            <div className={styles.leaf}>
                <Head id={node.id} lensDataset={lensDataset} fields={fields} codes={codes} />
            </div>
        ) : (
            <details>
                <summary className={styles.summary}>
                    <Head
                        id={node.id}
                        lensDataset={lensDataset}
                        fields={fields}
                        codes={codes}
                        narrower={node.children.length}
                    />
                </summary>
                <ul className={styles.children}>
                    {node.children.map((child) => (
                        <Branch
                            key={child.id}
                            node={child}
                            lensDataset={lensDataset}
                            fields={fields}
                            codes={codes}
                        />
                    ))}
                </ul>
            </details>
        )}
    </li>
);

/** The heads of the open property columns, each the property's name, over the list. */
const FieldHeads = ({ fields }: { fields: Fields }) => {
    const model = useModel();
    if (fields.length === 0) return null;

    return (
        <div className={styles.heads}>
            <span className={styles.cells}>
                {fields.map((property) => (
                    <span key={property} className={styles.cell} title={property}>
                        {model.label(property)}
                    </span>
                ))}
            </span>
        </div>
    );
};

type ValueTreeProps = {
    listId: string;
    /** The dataset of the filter, whose unused values are dimmed; null for none. */
    lensDataset: string | null;
};

/**
 * A value list's members as a tree by narrower values, each branch closed
 * until opened, with a column per open property the members carry, and a box
 * that filters by name, code, other name or open property value into a flat
 * list of matches.
 */
const ValueTree = ({ listId, lensDataset }: ValueTreeProps) => {
    const model = useModel();
    const [filter, setFilter] = useState('');
    const blank = filter.trim() === '';
    const { hits, total } = searchMembers(model, listId, filter);
    const fields = memberFields(model, model.members(listId));
    const codes = membersHaveCodes(model, model.members(listId));

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
            {(blank || total > 0) && <FieldHeads fields={fields} />}
            {blank ? (
                <ul className={styles.list}>
                    {model.memberTree(listId).map((node) => (
                        <Branch
                            key={node.id}
                            node={node}
                            lensDataset={lensDataset}
                            fields={fields}
                            codes={codes}
                        />
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
                                <Head
                                    id={id}
                                    lensDataset={lensDataset}
                                    fields={fields}
                                    codes={codes}
                                />
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
