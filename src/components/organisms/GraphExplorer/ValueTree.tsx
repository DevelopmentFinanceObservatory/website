'use client';

import classNames from 'classnames';
import { useState, type CSSProperties, type ReactNode } from 'react';

import { BreakableId } from './BreakableId';
import { useModel } from './ExploreContext';
import { TermLink } from './ExploreLink';
import { CeilingNote } from './ListToggle';
import styles from './ValueTree.module.scss';

import { count } from '@/lib/graphExplorer/counts';
import { firstMatches } from '@/lib/graphExplorer/lists';

import {
    cellWidth,
    membersHaveCodes,
    openColumns,
    searchMembers,
    type MemberTree,
    type OpenColumns,
} from '@/lib/graphExplorer/model';

/** The list's open property columns, each with its width in characters, and each member's cell. */
type Columns = {
    readonly cell: OpenColumns['cell'];
    readonly list: readonly { readonly property: string; readonly width: number }[];
};

/** A member's cell per open property, right-aligned so the columns line up at every depth. */
const Cells = ({ id, columns }: { id: string; columns: Columns }) => {
    const model = useModel();
    if (columns.list.length === 0) return null;

    return (
        <span className={styles.cells}>
            {columns.list.map(({ property, width }) => (
                <span
                    key={property}
                    className={styles.cell}
                    style={{ width: `${width}ch` }}
                    title={model.label(property)}
                >
                    <BreakableId text={columns.cell(id, property, ', ')} />
                </span>
            ))}
        </span>
    );
};

/**
 * A value's code, its link and its open property cells, dimmed when the
 * filter's dataset does not use it. The code is left out when no member of
 * the list has one. The branch marker, code, link and count of narrower
 * values form the name column, indented inside it by `depth`, so every row's
 * name column has the same edges and stays in view while the columns scroll
 * sideways.
 */
const Head = ({
    id,
    lensDataset,
    columns,
    codes,
    depth,
    narrower = 0,
}: {
    id: string;
    lensDataset: string | null;
    columns: Columns;
    codes: boolean;
    depth: number;
    narrower?: number;
}) => {
    const model = useModel();
    const unused = lensDataset !== null && model.usageIn(id, lensDataset) === 0;

    return (
        <>
            <span className={styles.name} style={{ '--depth': depth } as CSSProperties}>
                <span className={classNames(styles.marker, narrower > 0 && styles.branch)} />
                {codes && (
                    <span className={styles.code}>
                        {model.node(id)?.classification_code[0] ?? ''}
                    </span>
                )}
                <span className={classNames(styles.term, unused && styles.dim)}>
                    <TermLink id={id} />
                </span>
                {narrower > 0 && <span className={styles.count}>{count(narrower)} narrower</span>}
            </span>
            <Cells id={id} columns={columns} />
        </>
    );
};

/** What a reader does to reach the members past the ceiling of an unfiltered list. */
const FILTER_FOR_REST = 'Filter to find the rest.';

type BranchProps = {
    node: MemberTree;
    lensDataset: string | null;
    columns: Columns;
    codes: boolean;
    depth: number;
};

/**
 * A member and, once its branch is opened, its narrower members up to the
 * ceiling. A closed branch renders none of them.
 */
const Branch = ({ node, lensDataset, columns, codes, depth }: BranchProps) => {
    const [open, setOpen] = useState(false);

    if (node.children.length === 0) {
        return (
            <li>
                <div className={styles.row}>
                    <Head
                        id={node.id}
                        lensDataset={lensDataset}
                        columns={columns}
                        codes={codes}
                        depth={depth}
                    />
                </div>
            </li>
        );
    }

    const children = firstMatches(node.children);
    return (
        <li>
            <details onToggle={(event) => setOpen(event.currentTarget.open)}>
                <summary className={classNames(styles.row, styles.summary)}>
                    <Head
                        id={node.id}
                        lensDataset={lensDataset}
                        columns={columns}
                        codes={codes}
                        depth={depth}
                        narrower={node.children.length}
                    />
                </summary>
                {open && (
                    <>
                        <ul className={styles.children}>
                            {children.hits.map((child) => (
                                <Branch
                                    key={child.id}
                                    node={child}
                                    lensDataset={lensDataset}
                                    columns={columns}
                                    codes={codes}
                                    depth={depth + 1}
                                />
                            ))}
                        </ul>
                        <CeilingNote matches={children} then={FILTER_FOR_REST} />
                    </>
                )}
            </details>
        </li>
    );
};

/** The head row over the list: "Name", then each open property's name over its column. */
const FieldHeads = ({ columns }: { columns: Columns }) => {
    const model = useModel();
    if (columns.list.length === 0) return null;

    return (
        <div className={styles.heads}>
            <span className={styles.nameHead}>
                <span className={styles.marker} />
                Name
            </span>
            <span className={styles.cells}>
                {columns.list.map(({ property, width }) => (
                    <span
                        key={property}
                        className={styles.cell}
                        style={{ width: `${width}ch` }}
                        title={property}
                    >
                        <span className={styles.headText}>{model.label(property)}</span>
                    </span>
                ))}
            </span>
        </div>
    );
};

/**
 * The heads and rows in a region that scrolls sideways inside the panel,
 * with the name column held at its left edge. The rows keep room for a
 * readable name beside every column, so the columns line up under their
 * heads however many there are.
 */
const Table = ({ columns, children }: { columns: Columns; children: ReactNode }) => (
    <div className={styles.table}>
        <div className={classNames(styles.rows, columns.list.length > 0 && styles.columned)}>
            <FieldHeads columns={columns} />
            {children}
        </div>
    </div>
);

type ValueTreeProps = {
    listId: string;
    /** The dataset of the filter, whose unused values are dimmed; null for none. */
    lensDataset: string | null;
};

/**
 * A value list's members as a tree by narrower values, each branch closed
 * until opened, with a column per open property the members carry, and a box
 * that filters by name, code, other name, open property value or the label of
 * a value it refers to into a flat list of matches.
 */
const ValueTree = ({ listId, lensDataset }: ValueTreeProps) => {
    const model = useModel();
    const [filter, setFilter] = useState('');
    const blank = filter.trim() === '';
    const { hits, total } = searchMembers(model, listId, filter);
    const members = model.members(listId);
    const open = openColumns(model, members);
    const columns: Columns = {
        cell: open.cell,
        list: open.fields.map((property) => ({
            property,
            width: cellWidth(
                members.map((id) => open.cell(id, property, ', ')),
                model.label(property),
            ),
        })),
    };
    const codes = membersHaveCodes(model, members);
    const roots = firstMatches(model.memberTree(listId));

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
                <>
                    <Table columns={columns}>
                        <ul className={styles.list}>
                            {roots.hits.map((node) => (
                                <Branch
                                    key={node.id}
                                    node={node}
                                    lensDataset={lensDataset}
                                    columns={columns}
                                    codes={codes}
                                    depth={0}
                                />
                            ))}
                        </ul>
                    </Table>
                    <CeilingNote matches={roots} then={FILTER_FOR_REST} />
                </>
            ) : total === 0 ? (
                <p className={styles.note} role="status">
                    No value matches “{filter.trim()}”.
                </p>
            ) : (
                <>
                    <Table columns={columns}>
                        <ul className={styles.list}>
                            {hits.map((id) => (
                                <li key={id} className={styles.row}>
                                    <Head
                                        id={id}
                                        lensDataset={lensDataset}
                                        columns={columns}
                                        codes={codes}
                                        depth={0}
                                    />
                                </li>
                            ))}
                        </ul>
                    </Table>
                    <CeilingNote matches={{ hits, total }} then="Type more to narrow." />
                </>
            )}
        </div>
    );
};

export default ValueTree;
