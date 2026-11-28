import { useEffect, useId, useState } from 'react';

import { usePromptShell } from '../../shellContext';
import { Mark } from '../parts/Mark';
import { PageText } from '../parts/PageShell';
import { Section } from '../parts/Section';
import { TextButton } from '../parts/TextButton';
import { useConfirm } from '../parts/useConfirm';
import { Fold } from '../parts/Fold';
import { SourceRowButton } from '../Rows';
import styles from './CardPage.module.scss';

import SourceLink from '@/components/atoms/SourceLink/SourceLink';
import type { CitedSnapshot, CiteAsk } from '@/components/organisms/Studio/modals/CardInfoPanel';
import type { CardPageView } from '@/lib/studio/cardPageView';

/** Notes shown before `N more`. */
const NOTES_SHOWN = 3;

/** `Keep in mind`: three notes, then a fold for the rest. */
export const KeepSection = ({ notes }: { notes: string[] }) => {
    const [open, setOpen] = useState(false);
    const id = useId();

    if (notes.length === 0) return null;

    const shown = open ? notes : notes.slice(0, NOTES_SHOWN);
    const more = notes.length - NOTES_SHOWN;

    return (
        <Section label="Keep in mind" count={notes.length} data-sp-sec="c-keep">
            <ul id={id} className={styles.notes}>
                {shown.map((note, index) => (
                    <li key={`${note}#${index}`}>{note}</li>
                ))}
            </ul>
            {more > 0 && (
                <Fold open={open} onToggle={() => setOpen(!open)} controls={id} data-sp-key="keep">
                    {open ? 'Fewer' : `${more} more`}
                </Fold>
            )}
        </Section>
    );
};

/** `Source` or `Sources`: who computed the card, its sources, and a computed
 *  card's inputs when no calculation names them. */
export const SourcesSection = ({ view }: { view: CardPageView }) => {
    if (view.sources.length === 0 && view.inputs.length === 0 && !view.from) return null;

    return (
        <Section label={view.sources.length > 1 ? 'Sources' : 'Source'} data-sp-sec="c-src">
            {view.from && <p className={styles.computed}>{view.from}</p>}
            {view.sources.length > 0 && (
                <ul className={styles.sources}>
                    {view.sourceRows.map((row, index) => (
                        <li key={`${row.key}#${index}`} className={styles.sourceItem}>
                            <SourceRowButton source={row} />
                        </li>
                    ))}
                </ul>
            )}
            {view.inputs.length > 0 && (
                <>
                    <p className={styles.subLabel}>Calculated from</p>
                    <ul className={styles.notes}>
                        {view.inputs.map((input) => (
                            <li key={input}>{input}</li>
                        ))}
                    </ul>
                </>
            )}
        </Section>
    );
};

// What a failed snapshot link says, by why it failed.
const CITE_LINK_TEXT = {
    failed: 'Could not make a link. Try again.',
    limited: "This network has made today's links. Try again tomorrow.",
} as const;

const COPY_FAILED = 'Could not copy';

type CiteForm = 'short' | 'full';

const CITE_FORMS: Record<CiteForm, { label: string; copy: string }> = {
    short: { label: 'Short', copy: 'Copy short citation' },
    full: { label: 'Reference list', copy: 'Copy full citation' },
};

/** The page's link of the snapshot share a card is cited by. */
export const snapshotUrl = (id: string | undefined): string | null =>
    id && typeof window !== 'undefined'
        ? `${window.location.origin}/s/${encodeURIComponent(id)}`
        : null;

/**
 * `Cite as`: the citation in one form at a time, a switch when it has two,
 * `Copy`, and the owner's offer of a public snapshot link to cite, with the
 * link or why there is none, as More Info has them.
 */
export const CiteSection = ({
    cite,
    link,
    onAddLink,
}: {
    cite: NonNullable<CardPageView['cite']>;
    link: CitedSnapshot | CiteAsk | undefined;
    onAddLink: (() => void) | undefined;
}) => {
    const [form, setForm] = useState<CiteForm>('short');
    const { outcome, run } = useConfirm();
    const { announce } = usePromptShell();
    const shown: CiteForm = form === 'full' && cite.full ? 'full' : 'short';
    const text = shown === 'full' && cite.full ? cite.full : cite.short;
    const made = typeof link === 'object' ? snapshotUrl(link.id) : null;
    const linkFailure = link === 'failed' || link === 'limited' ? CITE_LINK_TEXT[link] : null;

    // A refused link is said once, as it arrives.
    useEffect(() => {
        if (linkFailure) announce(linkFailure);
    }, [linkFailure, announce]);

    // The copy shows how it ended in the button, and says it, as long as
    // every panel control does (useConfirm).
    const copyCitation = () =>
        run(() => navigator.clipboard.writeText(text), { done: 'Copied', failed: COPY_FAILED });
    const copyFailed = outcome === 'failed';
    const copyWords = outcome === 'done' ? 'Copied' : copyFailed ? COPY_FAILED : null;

    return (
        <Section
            label="Cite as"
            data-sp-sec="c-cite"
            action={
                cite.full ? (
                    <span className={styles.segment} role="group" aria-label="Citation style">
                        {(['short', 'full'] as const).map((entry) => (
                            <button
                                key={entry}
                                type="button"
                                aria-pressed={entry === shown}
                                onClick={() => setForm(entry)}
                            >
                                {CITE_FORMS[entry].label}
                            </button>
                        ))}
                    </span>
                ) : undefined
            }
        >
            <p className={styles.citation} data-sp-cite>
                {text}
            </p>
            <TextButton
                aria-label={copyWords ?? CITE_FORMS[shown].copy}
                data-failed={copyFailed || undefined}
                onClick={() => void copyCitation()}
            >
                {copyWords ?? 'Copy'}
            </TextButton>
            {cite.offer && onAddLink && link !== 'limited' && !made && (
                <p className={styles.citeNote}>
                    {cite.offer.note && <>{cite.offer.note} </>}
                    <TextButton disabled={link === 'minting'} onClick={onAddLink}>
                        {link === 'minting'
                            ? 'Creating a public link…'
                            : 'Create a public link to cite'}
                    </TextButton>
                </p>
            )}
            {made && (
                <p className={styles.citeNote}>
                    Public snapshot link added:{' '}
                    <a href={made} target="_blank" rel="noreferrer">
                        {made}
                    </a>
                </p>
            )}
            {linkFailure && <p className={styles.citeNote}>{linkFailure}</p>}
        </Section>
    );
};

/** `How this card was made`, folded: each step as a done mark, its verb and
 *  what it acted on, then notes and the source pages. */
export const MadeSection = ({ made }: { made: NonNullable<CardPageView['made']> }) => {
    const [open, setOpen] = useState(false);
    const id = useId();

    return (
        <Section
            data-sp-sec="c-made"
            label={
                <Fold
                    open={open}
                    onToggle={() => setOpen(!open)}
                    controls={id}
                    className={styles.headFold}
                    data-sp-key="made"
                >
                    How this card was made
                </Fold>
            }
        >
            <div id={id} hidden={!open} className={styles.made}>
                {made.steps.length > 0 && (
                    <ol className={styles.steps}>
                        {made.steps.map((step) => (
                            <li key={step.key} className={styles.step}>
                                <Mark state="done" />
                                <span>
                                    {step.verb && <span className={styles.op}>{step.verb} </span>}
                                    {step.object}
                                    {step.detail && (
                                        <span className={styles.stepDetail}>{step.detail}</span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
                {made.notes.map((note) => (
                    <PageText key={note}>{note}</PageText>
                ))}
                {made.pages.map((page) => (
                    <SourceLink key={page.key} className={styles.sourceName} dcid={page.page}>
                        {page.name}
                    </SourceLink>
                ))}
            </div>
        </Section>
    );
};

/** A legacy card's indicators, each with its id where a reader can use it,
 *  and its description. */
export const IndicatorsSection = ({ indicators }: { indicators: CardPageView['indicators'] }) =>
    indicators.length > 0 ? (
        <Section label="Indicators" count={indicators.length} data-sp-sec="c-ind">
            <ul className={styles.indicators}>
                {indicators.map((indicator) => (
                    <li key={indicator.key}>
                        <span className={styles.indicatorName}>{indicator.name}</span>
                        {indicator.id && <code className={styles.indicatorId}>{indicator.id}</code>}
                        {indicator.description && (
                            <span className={styles.stepDetail}>{indicator.description}</span>
                        )}
                    </li>
                ))}
            </ul>
        </Section>
    ) : null;
