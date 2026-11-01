'use client';

import styles from './DataSearch.module.scss';
import { useDefinitionMembers } from './GraphInfo';

import Icon from '@/components/atoms/Icon/Icon';
import SourceCodes from '@/components/atoms/SourceCodes/SourceCodes';
import SourceLink from '@/components/atoms/SourceLink/SourceLink';
import { useCopied } from '@/components/organisms/Studio/hooks/useCopied';
import { aboutAnswerNotes, type AboutAnswerNotes } from '@/lib/search/resultNotes';
import type { Assumption, PartSpec, Warning } from '@/lib/search/types';
import {
    buildWhySummary,
    maybeOneVariable,
    type SlotOptionsEntry,
    type WhyInside,
    type WhyRow,
    type WhySummary,
} from '@/lib/search/view';

/** What a Change control does for the binding a fact states on part
 *  `partIndex`: open the menu that edits it (refineMenu.ts's
 *  changeTarget). Null when nothing offers another value. */
export type ChangeAction = (partIndex: number, bindingRef: string) => (() => void) | null;

// A source's name, linked to its page when the answer names the source's
// document, as the card panel links a described source. A source without
// one stays plain text.
export const SourceName = ({
    source,
    label,
}: {
    source: { ref: string; documentation?: string | null };
    label: string;
}) => {
    if (!source.documentation) {
        return <span>{label}</span>;
    }

    return (
        <SourceLink dcid={source.ref} className={styles.whyLink}>
            {label}
            <Icon name="arrow-small" />
        </SourceLink>
    );
};

// Copies `value`, and shows a tick for a moment after. `hint` is the
// tooltip, and `label` when absent. A value printed nowhere else passes
// itself as the hint, so it stays readable when the clipboard refuses the
// copy.
const CopyButton = ({ value, label, hint }: { value: string; label: string; hint?: string }) => {
    const { copied, copy } = useCopied();

    return (
        <button
            type="button"
            className={styles.whyCopy}
            aria-label={copied ? 'Copied' : label}
            title={copied ? 'Copied' : (hint ?? label)}
            onClick={() => copy(value)}
        >
            <Icon name={copied ? 'check' : 'copy'} />
        </button>
    );
};

// The Change control of a fact the search filled in, when a menu offers
// another value for it. `what` names the fact for its accessible name.
const Change = ({ run, what }: { run: ReturnType<ChangeAction>; what: string }) =>
    run ? (
        <button
            type="button"
            className={styles.whyChange}
            aria-label={`Change ${what.toLowerCase()}`}
            onClick={run}
        >
            Change
        </button>
    ) : null;

const FactRow = ({ row, run }: { row: WhyRow; run: ReturnType<ChangeAction> }) => (
    <div className={styles.whyRow}>
        <dt>{row.label}</dt>
        <dd>
            {row.value}
            {row.variableId && (
                <CopyButton
                    value={row.variableId}
                    label="Copy the DFO variable id"
                    hint={row.variableId}
                />
            )}
            {row.sourceCodes && <SourceCodes codes={row.sourceCodes} className={styles.whyCodes} />}
            {row.note && <span className={styles.whyNote}>{row.note}</span>}
        </dd>
        <Change run={run} what={row.label} />
    </div>
);

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

// The ways the total can be split, folded. Each axis the variables differ
// on is listed with its values.
const InsideGroup = ({ inside }: { inside: WhyInside }) => (
    <div className={styles.whyGroup}>
        <details className={styles.whyInside}>
            <summary>
                <span className={styles.whyGroupTitle}>Inside this total</span>
                <Icon name="chevron-down" />
            </summary>
            {inside.summary && <p className={styles.whyInsideSummary}>{inside.summary}</p>}
            {inside.breakdown.map((breakdown) => (
                <div key={breakdown.title} className={styles.whyBreakdown}>
                    <p className={styles.whyBreakdownTitle}>{breakdown.title}</p>
                    {breakdown.values.map((value) => (
                        <p key={value} className={styles.whyBreakdownRow}>
                            {value}
                        </p>
                    ))}
                    {breakdown.more > 0 && (
                        <p className={styles.whyOrigin}>
                            and {breakdown.more} more {breakdown.more === 1 ? 'value' : 'values'}
                        </p>
                    )}
                </div>
            ))}
        </details>
    </div>
);

/** One definite part, as the panel sections it. */
export type AboutPart = {
    index: number;
    variableText: string | null;
    spec: PartSpec;
    warnings?: Warning[];
    assumptions?: Assumption[];
};

const AboutSection = ({
    label,
    summary,
    notes,
    change,
}: {
    label: string | null;
    summary: WhySummary;
    notes: AboutAnswerNotes;
    /** the Change action for a binding of this part */
    change: (bindingRef: string | undefined) => ReturnType<ChangeAction>;
}) => (
    <section className={styles.whySection} aria-label={label ?? undefined}>
        {label && <p className={styles.whySectionTitle}>{label}</p>}
        {notes.coverage && <p className={styles.whyCoverage}>{notes.coverage}</p>}
        <dl className={styles.whyRows}>
            {summary.rows.map((row) => (
                <FactRow key={row.label} row={row} run={change(row.bindingRef)} />
            ))}
        </dl>
        <NoteGroup
            title="Keep in mind"
            notes={[...summary.notes, ...notes.variance, ...notes.unavailable]}
        />
        {summary.inside && <InsideGroup inside={summary.inside} />}
        {summary.sources.length > 0 && (
            <div className={styles.whyGroup}>
                <p className={styles.whyGroupTitle}>
                    {summary.sources.length === 1 ? 'Source' : 'Sources'}
                </p>
                {summary.sources.map((source) => (
                    <div key={source.ref} className={styles.whySource}>
                        <p className={styles.whySourceName}>
                            <SourceName source={source} label={source.label} />
                            <Change
                                run={change(summary.sourceBindingRef ?? undefined)}
                                what="source"
                            />
                        </p>
                        {source.meta.length > 0 && (
                            <p className={styles.whyMeta}>{source.meta.join(' · ')}</p>
                        )}
                    </div>
                ))}
            </div>
        )}
        {summary.cite && (
            <div className={styles.whyGroup}>
                <p className={styles.whyGroupTitle}>Cite as</p>
                <p className={styles.whyCite}>
                    <span>{summary.cite}</span>
                    <CopyButton value={summary.cite} label="Copy citation" />
                </p>
            </div>
        )}
    </section>
);

// One part's section. Once the panel opens, its served members are read
// from the members door to name a single variable's id, and only when the
// answer may serve one variable, since no other list changes the section.
const AboutPartSection = ({
    part,
    label,
    open,
    optionsBySpec,
    changeAction,
}: {
    part: AboutPart;
    label: string | null;
    open: boolean;
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>;
    changeAction?: ChangeAction;
}) => {
    const members = useDefinitionMembers(open && maybeOneVariable(part.spec) ? part.spec : null);

    return (
        <AboutSection
            label={label}
            summary={buildWhySummary(
                part.spec,
                {
                    warnings: part.warnings ?? [],
                    variable_text: part.variableText,
                    assumptions: part.assumptions,
                },
                members,
            )}
            notes={aboutAnswerNotes(part.spec, part.warnings, optionsBySpec)}
            change={(ref) => (ref && changeAction ? changeAction(part.index, ref) : null)}
        />
    );
};

/** The "About this answer" panel: one section per definite part, each with
 *  the answer line, the facts (a fact the search filled in says why and
 *  offers Change), what to keep in mind, what the total holds, the sources
 *  with their publisher and licence, and one citation. A lone part carries
 *  no title. `open` is whether the panel shows, which starts the members
 *  reads. `changeAction` opens the menu that edits a fact; without it no
 *  Change shows. */
const WhyPanel = ({
    parts,
    open,
    optionsBySpec,
    changeAction,
}: {
    parts: AboutPart[];
    open: boolean;
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>;
    changeAction?: ChangeAction;
}) => (
    <div className={styles.why}>
        {parts.map((part, at) => (
            <AboutPartSection
                key={part.index}
                part={part}
                label={parts.length > 1 ? (part.variableText ?? `Part ${at + 1}`) : null}
                open={open}
                optionsBySpec={optionsBySpec}
                changeAction={changeAction}
            />
        ))}
    </div>
);

export default WhyPanel;
