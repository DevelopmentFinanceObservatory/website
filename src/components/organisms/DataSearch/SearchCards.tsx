/* eslint-disable @typescript-eslint/no-explicit-any -- deliberately shallow engine-contract layer (see lib/search/types.ts for the full mirror) */
'use client';

import classNames from 'classnames';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';
import { buildAmbiguousPickPart, offersAmbiguousPicker } from '@/lib/search/parsedEdit';
import {
    cardText,
    coverageSummary,
    noDataCallout,
    noDataText,
    primaryStatVarLabel,
    shapeOrigin,
    specOrigin,
    statVarsUnreadable,
} from '@/lib/search/view';

// A card's meta line, its coverage then its origin (specOrigin beside the
// spec's own sentence, shapeOrigin beside any other title). The line clamps
// at two lines, so the full text goes in the title attribute.
const CardMeta = ({ spec, origin }: { spec: any; origin: string | null }) => {
    const meta = [coverageSummary(spec), origin].filter(Boolean).join(' · ');

    return (
        <span className={styles.cardMeta} title={meta}>
            {meta}
        </span>
    );
};

// Non-definite outcomes shown outside the sentence itself: the idle prompt's
// background suggestion preview (a definite or candidates part, each card
// handing its text back to the prompt), and a no_data part's nearest
// subsets / Studio handoff. Not rendered for a part whose slot token already
// offers its own picker (entity_ambiguous with a marked token), which would
// duplicate it. A single-part plan has no slot token, so this is its only
// picker. A candidates part of an answer draws ReadingCards instead.
// Takes one part. The caller (DataSearch for a no_data part, or the idle
// prompt's suggestion preview reading parts[0]) already knows which.
const SearchCards = ({
    part,
    partIndex,
    onPick,
    onEditParsed,
    onStudio,
    question,
}: {
    part: any;
    // Omitted for the idle prompt's suggestion preview, which has no part to
    // edit back into.
    partIndex?: number;
    onPick: (text?: string) => void;
    // Posts an entity_ambiguous pick as a parsed entry, the single-part
    // plan's escape hatch when there's no slot token to hang a picker off.
    onEditParsed?: (partIndex: number, editedPart: any) => void;
    // Hands the question and the datasets on screen to Studio (DataSearch's
    // openStudio); the no_data Studio callout's button is hidden without it.
    onStudio?: () => void;
    // The user's own question, read by noDataCallout and re-run by an
    // unreadable subset's retry.
    question?: string;
}) => {
    // A definite background suggestion renders as a single pickable card.
    if (part?.status === 'definite' && part.spec) {
        const spec = part.spec;
        const text = cardText(spec, part.variable_text);

        return (
            <div className={styles.cardsBlock}>
                <p className={styles.cardsTitle}>Looks like a match…</p>
                <div className={styles.cards}>
                    <button type="button" className={styles.card} onClick={() => onPick(text)}>
                        <span className={styles.cardTitle}>{text}</span>
                        <CardMeta spec={spec} origin={specOrigin(spec)} />
                    </button>
                </div>
            </div>
        );
    }

    if (part?.status === 'candidates') {
        const specs = part.candidates?.specs ?? [];

        return (
            <div className={styles.cardsBlock}>
                <p className={styles.cardsTitle}>
                    Multiple possible interpretations found. Select the best fit…
                </p>
                <div className={styles.cards}>
                    {specs.map((spec: any, index: number) => (
                        <button
                            key={spec.spec_id}
                            type="button"
                            className={styles.card}
                            style={{ '--i': index } as React.CSSProperties}
                            onClick={() => onPick(cardText(spec, part.variable_text))}
                        >
                            <span className={styles.cardTitle}>
                                {cardText(spec, part.variable_text)}
                            </span>
                            <CardMeta spec={spec} origin={specOrigin(spec)} />
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (part?.status === 'no_data') {
        // The single-part escape hatch for entity_ambiguous picking (see
        // module doc). A pick pins the candidate's dcid onto the matching
        // restatement entity and posts a parsed entry, a no-op if no entity
        // matches.
        if (offersAmbiguousPicker(part) && onEditParsed && partIndex !== undefined) {
            const restatement = part.restatement;
            const groups = part.no_data.ambiguous_entities ?? [];

            return (
                <div className={styles.cardsBlock}>
                    <p className={styles.cardsTitle}>Choose a Match</p>
                    <div className={styles.cards}>
                        {groups.flatMap((group: any) =>
                            group.candidates.map((candidate: any, index: number) => (
                                <button
                                    key={`${group.text}:${candidate.ref}`}
                                    type="button"
                                    className={styles.card}
                                    style={{ '--i': index } as React.CSSProperties}
                                    onClick={() => {
                                        const edited = buildAmbiguousPickPart(
                                            restatement,
                                            group.text,
                                            candidate,
                                        );

                                        if (edited) onEditParsed(partIndex, edited);
                                    }}
                                >
                                    <span className={styles.cardTitle}>{candidate.label}</span>
                                </button>
                            )),
                        )}
                    </div>
                </div>
            );
        }

        const nearest = part.no_data?.nearest_real ?? [];
        const callout = noDataCallout(part, question);

        // noDataText carries the per-reason wording. The button hands its
        // edit text back to the prompt.
        if (callout?.kind === 'flagged') {
            return (
                <div className={styles.callout}>
                    <p className={styles.calloutTitle}>Close, but not quite…</p>
                    <p className={styles.calloutText}>{noDataText(part.no_data)}</p>
                    <Button icon="arrow" wide onClick={() => onPick(callout.editText)}>
                        Edit this search
                    </Button>
                </div>
            );
        }

        if (callout?.kind === 'alternate') {
            return (
                <div className={styles.callout}>
                    <p className={styles.calloutTitle}>A different variable has data…</p>
                    <p className={styles.calloutText}>{noDataText(part.no_data)}</p>
                    <div className={styles.cards}>
                        <button
                            type="button"
                            className={styles.card}
                            onClick={() => onPick(callout.pickText)}
                        >
                            <span className={styles.cardTitle}>{callout.text}</span>
                            <span className={styles.cardMeta}>{coverageSummary(callout.spec)}</span>
                        </button>
                    </div>
                </div>
            );
        }

        if (callout?.kind === 'studio') {
            return (
                <div className={styles.callout}>
                    <p className={styles.calloutTitle}>This needs more than a dataset query…</p>
                    <p className={styles.calloutText}>
                        This question involves multiple datasets and some reasoning to get right.
                        Open it in Studio and an agent will plan and run the analysis for you.
                    </p>
                    {onStudio && (
                        <Button icon="arrow" wide onClick={onStudio}>
                            Open Studio
                        </Button>
                    )}
                </div>
            );
        }

        return (
            <div className={styles.cardsBlock}>
                <p className={styles.cardsTitle}>Largest Subsets</p>
                <div className={styles.cards}>
                    {nearest.map((spec: any, index: number) => {
                        const unreadable = statVarsUnreadable(spec);

                        // A shape the client couldn't parse has no title to
                        // promote as the next query — the diagnostic text
                        // must stay diagnostic. Disabled instead of picked,
                        // with a real retry (re-running the same question) in
                        // its place.
                        if (unreadable) {
                            return (
                                <div
                                    key={spec.spec_id}
                                    className={classNames(styles.card, styles.cardUnreadable)}
                                    style={{ '--i': index } as React.CSSProperties}
                                >
                                    <span
                                        className={classNames(
                                            styles.cardTitle,
                                            styles.cardTitleUnreadable,
                                        )}
                                    >
                                        Couldn&rsquo;t read this result
                                    </span>
                                    <CardMeta spec={spec} origin={shapeOrigin(spec.shape)} />
                                    <Button
                                        variant="outline"
                                        small
                                        className={styles.cardRetry}
                                        disabled={!question}
                                        onClick={() => question && onPick(question)}
                                    >
                                        Retry the search
                                    </Button>
                                </div>
                            );
                        }

                        const title = part.variable_text ?? primaryStatVarLabel(spec);

                        return (
                            <button
                                key={spec.spec_id}
                                type="button"
                                className={styles.card}
                                style={{ '--i': index } as React.CSSProperties}
                                onClick={() => onPick(title ?? undefined)}
                            >
                                <span className={styles.cardTitle}>{title}</span>
                                <CardMeta spec={spec} origin={shapeOrigin(spec.shape)} />
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    return null;
};

export default SearchCards;
