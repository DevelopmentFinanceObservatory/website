'use client';

import { useId, useState, type ReactNode } from 'react';

import { BreakableId } from './BreakableId';
import { downloadCsv } from './downloadCsv';
import { useModel } from './ExploreContext';
import { TermLink } from './ExploreLink';
import { CeilingNote, FilterBox, FilterNoteLine, ListToggle, useListOrigins } from './ListToggle';
import styles from './PatternGroups.module.scss';

import Button from '@/components/atoms/Button/Button';
import { count, plural } from '@/lib/graphExplorer/counts';
import { shareWords } from '@/lib/graphExplorer/focus';
import { LIST_CEILING, LIST_HEAD, listOnShow } from '@/lib/graphExplorer/lists';
import { patternId } from '@/lib/graphExplorer/model';
import {
    groupFilter,
    groupSentence,
    patternFilter,
    patternGroups,
    patternLine,
    type PatternGroup,
    type SentencePart,
} from '@/lib/graphExplorer/sentence';
import { patternFileName, patternTable } from '@/lib/graphExplorer/tables';
import type { SchemaPattern } from '@/lib/graphExplorer/wire';

/** The origin of a dataset whose terms a list tags against (TermLink's `home`), null for the DFO's. */
type Home = 'base' | 'un_system' | null;

const HOME_NOTES: Readonly<Record<'base' | 'un_system', string>> = {
    base: 'Terms are base Data Commons’ unless tagged.',
    un_system: 'Terms are the UN System’s unless tagged.',
};

/** What a reader does to reach the patterns past a list's ceiling. */
const CSV_HAS_ALL = 'The CSV has every pattern.';

/** A group row is a sentence several lines tall, so the open list stops sooner than a list of terms. */
const GROUP_CEILING = 24;

/** The punctuation a sentence's text part opens with, which belongs to the term before it. */
const leadingMark = (part: SentencePart | undefined): string =>
    part?.kind === 'text' ? (/^[,.;:]/.exec(part.text)?.[0] ?? '') : '';

const Sentence = ({ parts, home }: { parts: readonly SentencePart[]; home: Home }) => (
    <p className={styles.sentence}>
        {parts.map((part, at) =>
            part.kind === 'term' ? (
                <TermLink key={at} id={part.id} home={home} trail={leadingMark(parts[at + 1])} />
            ) : (
                <span key={at}>
                    {part.text.slice(parts[at - 1]?.kind === 'term' ? leadingMark(part).length : 0)}
                </span>
            ),
        )}
    </p>
);

/**
 * One pattern of a group: its population type by label and dcid, its
 * StatVar count, the fields that tell it from the group's other patterns
 * (patternLine), and one example.
 */
const PatternLineView = ({
    group,
    pattern,
    home,
}: {
    group: PatternGroup;
    pattern: SchemaPattern;
    home: Home;
}) => {
    const line = patternLine(group, pattern);
    const hasDetail =
        line.measured !== null ||
        line.denominator !== null ||
        line.unresolved ||
        line.statType !== null;

    return (
        <li className={styles.line}>
            <span className={styles.lineHead}>
                <span>
                    {line.populationType === null ? (
                        'No population type'
                    ) : (
                        <TermLink id={line.populationType} home={home} />
                    )}
                </span>
                <span className={styles.mono}>{count(line.statVarCount)}</span>
            </span>
            {line.populationType !== null && (
                <span className={styles.mono}>
                    <BreakableId text={line.populationType} />
                </span>
            )}
            {hasDetail && (
                <span className={styles.detail}>
                    {line.measured !== null && (
                        <span>
                            Measures <TermLink id={line.measured} home={home} />
                        </span>
                    )}
                    {line.denominator !== null && (
                        <span>
                            per{' '}
                            <span className={styles.mono}>
                                <BreakableId text={line.denominator} />
                            </span>
                        </span>
                    )}
                    {line.denominator === null && line.unresolved && (
                        <span>per an unresolved denominator</span>
                    )}
                    {line.statType !== null && (
                        <span>
                            stat type{' '}
                            <span className={styles.mono}>
                                <BreakableId text={line.statType} />
                            </span>
                        </span>
                    )}
                </span>
            )}
            {line.example !== null && (
                <span className={styles.meta}>
                    e.g. <BreakableId text={line.example} />
                </span>
            )}
        </li>
    );
};

/** A group's patterns: the first few, then all of them up to the ceiling. */
const PatternList = ({ group, home, id }: { group: PatternGroup; home: Home; id: string }) => {
    const model = useModel();
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const filtering = open && group.patterns.length > LIST_CEILING;
    const { head, shown } = listOnShow(group.patterns, {
        open,
        matches: filtering ? patternFilter(model, filter) : null,
    });

    return (
        <div className={styles.members}>
            {filtering && (
                <FilterBox value={filter} onChange={setFilter} label="Filter these patterns" />
            )}
            <ul id={id} className={styles.lines}>
                {shown.hits.map((pattern) => (
                    <PatternLineView
                        key={patternId(pattern)}
                        group={group}
                        pattern={pattern}
                        home={home}
                    />
                ))}
            </ul>
            {filtering ? (
                <FilterNoteLine text={filter} matches={shown} also={CSV_HAS_ALL} />
            ) : (
                <CeilingNote matches={shown} then={CSV_HAS_ALL} />
            )}
            <ListToggle
                head={head}
                noun="patterns"
                controls={id}
                open={open}
                onToggle={() => setOpen((was) => !was)}
            />
        </div>
    );
};

type GroupRowProps = {
    group: PatternGroup;
    groups: readonly PatternGroup[];
    total: number;
    home: Home;
    action?: PatternGroupsProps['action'];
};

/**
 * A split combination: its sentence, its StatVar count and share, and
 * either its one pattern's example or a toggle listing its patterns.
 */
const GroupRow = ({ group, groups, total, home, action }: GroupRowProps) => {
    const model = useModel();
    const [open, setOpen] = useState(false);
    const listId = useId();
    const many = group.patterns.length > 1;
    const example = group.patterns[0]?.examples[0];

    return (
        <li className={styles.group}>
            <Sentence parts={groupSentence(model, group)} home={home} />
            <div className={styles.facts}>
                <span className={styles.meta}>
                    {plural(group.statVarCount, 'StatVar')}
                    {total > 0 && `, ${shareWords(group.statVarCount, total)}`}
                </span>
                {many && (
                    <button
                        type="button"
                        className={styles.expand}
                        aria-expanded={open}
                        aria-controls={open ? listId : undefined}
                        onClick={() => setOpen((was) => !was)}
                    >
                        {plural(group.patterns.length, 'pattern')}
                    </button>
                )}
                {action?.(group, groups)}
            </div>
            {!many && example !== undefined && (
                <p className={styles.meta}>
                    For example <BreakableId text={example} />
                </p>
            )}
            {many && open && <PatternList group={group} home={home} id={listId} />}
        </li>
    );
};

export type PatternGroupsProps = {
    /** The dataset whose patterns are listed. */
    datasetId: string;
    /**
     * A control for one split combination, rendered on its row after the
     * StatVar count. It receives every group too, so it can hide itself
     * for a dataset of one.
     */
    action?: (group: PatternGroup, groups: readonly PatternGroup[]) => ReactNode;
    /** More controls beside Download CSV under the list. */
    children?: ReactNode;
};

/**
 * A dataset's patterns by split combination (patternGroups): a count line,
 * the first few combinations with the share of StatVars they hold, then
 * all of them up to the ceiling, and a CSV file of every pattern. Terms
 * carry an origin tag only where their origin differs from the dataset's.
 */
export const PatternGroups = ({ datasetId, action, children }: PatternGroupsProps) => {
    const model = useModel();
    const origins = useListOrigins(model);
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const listId = useId();
    const dataset = model.dataset(datasetId);
    if (dataset === undefined || dataset.patterns.length === 0) return null;

    const origin = origins.dataset(dataset);
    const home: Home = origin === 'base' || origin === 'un_system' ? origin : null;
    const groups = patternGroups(dataset.patterns);
    const total = dataset.stat_var_count;
    const filtering = open && groups.length > GROUP_CEILING;
    const { head, shown } = listOnShow(groups, {
        open,
        limit: GROUP_CEILING,
        matches: filtering ? groupFilter(model, filter) : null,
    });
    const headShare = groups
        .slice(0, LIST_HEAD)
        .reduce((sum, group) => sum + group.statVarCount, 0);

    return (
        <div className={styles.groups}>
            <p className={styles.count}>
                {plural(dataset.patterns.length, 'pattern')} in{' '}
                {plural(groups.length, 'split combination')}
                {head.long && ', most StatVars first'}.{home !== null && ` ${HOME_NOTES[home]}`}
            </p>
            {filtering && (
                <FilterBox
                    value={filter}
                    onChange={setFilter}
                    label="Filter the split combinations"
                />
            )}
            <ol id={listId} className={styles.list}>
                {shown.hits.map((group) => (
                    <GroupRow
                        key={group.key}
                        group={group}
                        groups={groups}
                        total={total}
                        home={home}
                        action={action}
                    />
                ))}
            </ol>
            {head.long && !open && total > 0 && (
                <p className={styles.note}>
                    The {LIST_HEAD} shown hold {shareWords(headShare, total)} of its StatVars.
                </p>
            )}
            {filtering ? (
                <FilterNoteLine text={filter} matches={shown} also={CSV_HAS_ALL} />
            ) : (
                <CeilingNote matches={shown} then={CSV_HAS_ALL} />
            )}
            <ListToggle
                head={head}
                noun="split combinations"
                controls={listId}
                open={open}
                onToggle={() => setOpen((was) => !was)}
            />
            <div className={styles.actions}>
                <Button
                    small
                    onClick={() =>
                        downloadCsv(
                            patternTable(model, datasetId),
                            patternFileName(model, datasetId),
                        )
                    }
                >
                    Download CSV
                </Button>
                {children}
            </div>
        </div>
    );
};
