'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './DataSearch.module.scss';
import { useDefinitionMembers, useNodeDescriptions, useSideNote, useSourceDocs } from './GraphInfo';
import { stopMenuFieldTypeahead } from './SlotMenu';

import Icon from '@/components/atoms/Icon/Icon';
import SourceLink from '@/components/atoms/SourceLink/SourceLink';
import type { MemberSpec } from '@/lib/search/definitionMembers';
import type { TokenAboutModel } from '@/lib/search/tokenAbout';

type NoteEntry = { key: string; term: string | null; text: string };

const NoteEntries = ({ entries }: { entries: NoteEntry[] }) =>
    entries.map((entry) => (
        <span key={entry.key} className={styles.tokenAboutNoteEntry}>
            {entry.term && <span className={styles.tokenAboutTerm}>{entry.term}: </span>}
            {entry.text}
        </span>
    ));

/**
 * The About line for a sentence token's current value (`tokenAbout`): its
 * name and short facts on one line, then a link to each source's Sources
 * page the catalogue has. It heads every token panel, so the options follow
 * at once, and stands alone as the panel of a token with nothing to pick.
 *
 * The longer text (the model's notes, the graph's definition of each node
 * it names, a source's publisher and description) waits behind the line's
 * info mark: a side note beside the panel while the pointer rests on the
 * mark or the keyboard focuses it, and a block under the line, toggled by
 * a tap, where nothing hovers (a touch screen). A press pins the note open
 * until the next press, or until it closes as any side note does
 * (`useSideNote`). The mark shows only once there is text to show. A
 * menu's current row carries no note of its own, so each definition prints
 * once per panel.
 *
 * `statVarSpec` (`singleStatVarSpec`) is a measure's Spec when it serves one
 * StatVar. The block reads that StatVar from the members door as it mounts,
 * which is when its panel opens, and defines it after the measure's values.
 */
export const TokenAbout = ({
    about,
    statVarSpec = null,
}: {
    about: TokenAboutModel;
    statVarSpec?: MemberSpec | null;
}) => {
    const members = useDefinitionMembers(statVarSpec);
    const statVar = members?.ok && members.members.length === 1 ? members.members[0] : null;
    const definitions = statVar
        ? [...about.definitions, { label: null, dcid: statVar.dcid }]
        : about.definitions;
    const descriptions = useNodeDescriptions(definitions.map((entry) => entry.dcid));
    const docs = useSourceDocs(about.sources.map((source) => source.dcid));
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    // A token naming one source is titled by it already.
    const namedSources = about.sources.length > 1;

    const entries: NoteEntry[] = [
        ...about.notes.map((text, at) => ({ key: `note-${at}`, term: null, text })),
        ...definitions.flatMap((definition, at) => {
            const text = descriptions[at];

            return text ? [{ key: definition.dcid, term: definition.label, text }] : [];
        }),
        // A source's publisher, then its description, each under the
        // source's name when the line names several.
        ...about.sources.flatMap((source, at) => {
            const term = namedSources ? source.label : null;

            return [source.origin, docs[at]?.description]
                .filter((text): text is string => !!text)
                .map((text, line) => ({ key: `${source.dcid}-${line}`, term, text }));
        }),
    ];
    const {
        id: noteId,
        open: shown,
        pinned,
        toggle,
        markRef,
        noteRef,
    } = useSideNote<HTMLButtonElement, HTMLDivElement>({
        wanted: entries.length > 0 && (hovered || focused),
        content: entries.length,
    });
    const links = about.sources.filter((_, at) => docs[at]?.hasPage);

    return (
        <div className={styles.tokenAbout}>
            <p className={styles.tokenAboutLine}>
                {about.title && <span className={styles.tokenAboutTitle}>{about.title}</span>}
                {about.facts.map((fact) => (
                    <span key={fact} className={styles.tokenAboutFact}>
                        {fact}
                    </span>
                ))}
                {links.map((source) => (
                    // A menu field, so the panel's arrow keys reach it.
                    <SourceLink
                        key={source.dcid}
                        dcid={source.dcid}
                        className={styles.tokenAboutLink}
                        data-menu-field="field"
                    >
                        {namedSources ? `About ${source.label}` : 'About this source'}
                        <Icon name="arrow-small" />
                    </SourceLink>
                ))}
                {entries.length > 0 && (
                    <button
                        ref={markRef}
                        type="button"
                        className={styles.tokenAboutMark}
                        aria-label={`Details: ${about.title}`}
                        aria-describedby={noteId}
                        aria-expanded={pinned}
                        data-state={shown ? 'open' : undefined}
                        data-menu-field="field"
                        onPointerEnter={(event) => setHovered(event.pointerType !== 'touch')}
                        onPointerLeave={() => setHovered(false)}
                        // Only a keyboard focus opens the note: a tap focuses
                        // too, and toggles it through the click.
                        onFocus={(event) =>
                            setFocused(event.currentTarget.matches(':focus-visible'))
                        }
                        onBlur={() => setFocused(false)}
                        onClick={toggle}
                        onKeyDown={stopMenuFieldTypeahead}
                    >
                        <Icon name="info" />
                    </button>
                )}
            </p>
            {/* Where nothing hovers, the note opens in place under the line
                (the styles show one or the other). */}
            {pinned && entries.length > 0 && (
                <div aria-hidden="true" className={styles.tokenAboutNoteInline}>
                    <NoteEntries entries={entries} />
                </div>
            )}
            {entries.length > 0 &&
                createPortal(
                    <div
                        ref={noteRef}
                        id={noteId}
                        role="tooltip"
                        hidden={!shown}
                        className={styles.tokenAboutNote}
                    >
                        <NoteEntries entries={entries} />
                    </div>,
                    document.body,
                )}
        </div>
    );
};
