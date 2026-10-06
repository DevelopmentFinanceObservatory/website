'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from './DataSearch.module.scss';
import { OptionFilterInput } from './SlotMenu';
import { sourceDoc, useDefinitionMembers } from './GraphInfo';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import { aboutAnswerNotes, type AboutAnswerNotes } from '@/lib/search/resultNotes';
import type { Warning } from '@/lib/search/types';
import {
    buildWhySummary,
    formatCount,
    type SlotOptionsEntry,
    type WhyBreakdown,
    type WhySummary,
    type WhyVariables,
} from '@/lib/search/view';

// The variables listed before "Show all".
const FIRST_VARIABLES = 10;

// A source's name, linked to its page once the documentation door answers
// for it. A source the catalogue excludes has no page and stays plain text.
export const SourceName = ({ dcid, label }: { dcid: string; label: string }) => {
    const [hasPage, setHasPage] = useState(false);

    useEffect(() => {
        let active = true;

        sourceDoc(dcid).then((doc) => {
            if (active) {
                setHasPage(doc != null);
            }
        });

        return () => {
            active = false;
        };
    }, [dcid]);

    if (!hasPage) {
        return <span>{label}</span>;
    }

    // The dcid carries slashes, so the route is a catch-all and the id goes
    // in unescaped (as the Sources cards link it).
    return (
        <Link href={`/data/sources/${dcid}`} className={styles.whyLink}>
            {label}
            <Icon name="arrow-small" />
        </Link>
    );
};

// The variables counted by each value of an axis they differ on.
const Breakdown = ({ breakdown }: { breakdown: WhyBreakdown }) => (
    <div className={styles.whyBreakdown}>
        <p className={styles.whyBreakdownTitle}>{breakdown.title}</p>
        {breakdown.values.map((value) => (
            <p key={value.label} className={styles.whyBreakdownRow}>
                <span>{value.label}</span>
                <span>{formatCount(value.count)}</span>
            </p>
        ))}
        {breakdown.more > 0 && (
            <p className={styles.whySummary}>
                and {formatCount(breakdown.more)} more {breakdown.more === 1 ? 'value' : 'values'}
            </p>
        )}
    </div>
);

// The summary, the breakdown by axis value when the variables differ on an
// axis, and the list the members door answers. With a breakdown, "Show all"
// opens the whole list. Without one, the first variables show before it.
const VariablesGroup = ({ variables }: { variables: WhyVariables }) => {
    const [filter, setFilter] = useState('');
    const [showAll, setShowAll] = useState(false);

    const items = variables.members.state === 'listed' ? variables.members.items : [];
    const first = variables.breakdown.length > 0 ? 0 : FIRST_VARIABLES;
    const needle = filter.trim().toLowerCase();
    const matches = needle
        ? items.filter(
              (item) =>
                  item.label.toLowerCase().includes(needle) ||
                  item.dcid.toLowerCase().includes(needle),
          )
        : items;
    const shown = needle || showAll ? matches : matches.slice(0, first);
    const hidden = items.length - first;

    return (
        <div className={styles.whyGroup}>
            <p className={styles.whyGroupTitle}>
                <span>Variables</span>
                <span>
                    {formatCount(variables.count)}
                    {variables.exact ? '' : '+'}
                </span>
            </p>
            <p className={styles.whySummary}>{variables.summary}</p>
            {variables.breakdown.map((breakdown) => (
                <Breakdown key={breakdown.title} breakdown={breakdown} />
            ))}
            {variables.members.state === 'loading' && (
                <p className={styles.whySummary}>Reading the variables…</p>
            )}
            {variables.members.state === 'failed' && (
                <p className={styles.whySummary}>The variables could not be listed.</p>
            )}
            {hidden > 0 && (first > 0 || showAll) && (
                <OptionFilterInput
                    value={filter}
                    onChange={setFilter}
                    label={`Filter ${formatCount(items.length)} variables`}
                />
            )}
            {shown.map((item) => (
                <p key={item.dcid} className={styles.whyRef}>
                    {item.label} <code>{item.dcid}</code>
                </p>
            ))}
            {needle && matches.length === 0 && (
                <p className={styles.whySummary}>No variable matches the filter.</p>
            )}
            {!needle && hidden > 0 && (
                <Button
                    variant="plain"
                    icon="chevron-down"
                    className={styles.whyMore}
                    data-open={showAll}
                    onClick={() => setShowAll((open) => !open)}
                >
                    {showAll ? 'Show fewer' : `Show all ${formatCount(items.length)}`}
                </Button>
            )}
        </div>
    );
};

// A titled group of plain sentences.
const NoteGroup = ({ title, notes }: { title: string; notes: string[] }) =>
    notes.length === 0 ? null : (
        <div className={styles.whyGroup}>
            <p className={styles.whyGroupTitle}>{title}</p>
            {notes.map((sentence) => (
                <p key={sentence} className={styles.whySummary}>
                    {sentence}
                </p>
            ))}
        </div>
    );

/** One definite part, as the panel sections it. */
export type AboutPart = {
    index: number;
    variableText: string | null;
    spec: Parameters<typeof buildWhySummary>[0];
    warnings?: Warning[];
};

const AboutSection = ({
    label,
    summary,
    notes,
}: {
    label: string | null;
    summary: WhySummary;
    notes: AboutAnswerNotes;
}) => (
    <section className={styles.whySection} aria-label={label ?? undefined}>
        {label && <p className={styles.whySectionTitle}>{label}</p>}
        {notes.coverage && <p className={styles.whyCoverage}>{notes.coverage}</p>}
        <dl className={styles.whyRows}>
            {summary.rows.map((row) => (
                <div key={row.label} className={styles.whyRow}>
                    <dt>{row.label}</dt>
                    <dd>
                        {row.value}
                        {/* The space keeps the dcid a word of its own in copied
                            and read-aloud text. */}
                        {row.code && (
                            <>
                                {' '}
                                <code>{row.code}</code>
                            </>
                        )}
                    </dd>
                </div>
            ))}
        </dl>
        {summary.family && <p className={styles.whyFamily}>{summary.family}</p>}
        <NoteGroup title="What we assumed" notes={notes.assumptions} />
        <NoteGroup title="What varies" notes={notes.variance} />
        <NoteGroup title="Data not available" notes={notes.unavailable} />
        {summary.variables && <VariablesGroup variables={summary.variables} />}
        {summary.chosen.length > 0 && (
            <div className={styles.whyGroup}>
                <p className={styles.whyGroupTitle}>How this was chosen</p>
                {summary.chosen.map((choice) => (
                    <p key={`${choice.label}:${choice.value}`} className={styles.whyRef}>
                        <span>
                            {choice.label}: {choice.value}
                        </span>
                        <span className={styles.whyOrigin}>{choice.reason}</span>
                    </p>
                ))}
            </div>
        )}
        {summary.sources.length > 0 && (
            <div className={styles.whyGroup}>
                <p className={styles.whyGroupTitle}>
                    {summary.sources.length === 1 ? 'Source' : 'Sources'}
                </p>
                {summary.sources.map((source) => (
                    <p key={source.dcid} className={styles.whyRef}>
                        <SourceName dcid={source.dcid} label={source.label} />
                        {source.origin && <span className={styles.whyOrigin}>{source.origin}</span>}
                        {source.licence && (
                            <span className={styles.whyOrigin}>Licence: {source.licence}</span>
                        )}
                    </p>
                ))}
            </div>
        )}
    </section>
);

// One part's section. Its served members are read from the members door
// once the panel opens.
const AboutPartSection = ({
    part,
    label,
    open,
    optionsBySpec,
}: {
    part: AboutPart;
    label: string | null;
    open: boolean;
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>;
}) => {
    const members = useDefinitionMembers(open ? part.spec : null);

    return (
        <AboutSection
            label={label}
            summary={buildWhySummary(
                part.spec,
                { warnings: part.warnings ?? [], variable_text: part.variableText },
                members,
            )}
            notes={aboutAnswerNotes(part.spec, part.warnings, optionsBySpec)}
        />
    );
};

/** The "About this answer" panel: one section per definite part, each with
 *  the coverage sentence, what the search matched and assumed, the
 *  variables, how each facet and defaulted slot was chosen, and the sources
 *  with their licence. A lone part carries no title. `open` is whether the
 *  panel shows, which starts the members reads. */
const WhyPanel = ({
    parts,
    open,
    optionsBySpec,
}: {
    parts: AboutPart[];
    open: boolean;
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>;
}) => (
    <div className={styles.why}>
        {parts.map((part, at) => (
            <AboutPartSection
                key={part.index}
                part={part}
                label={parts.length > 1 ? (part.variableText ?? `Part ${at + 1}`) : null}
                open={open}
                optionsBySpec={optionsBySpec}
            />
        ))}
    </div>
);

export default WhyPanel;
