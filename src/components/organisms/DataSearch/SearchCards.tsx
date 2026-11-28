'use client';

import classNames from 'classnames';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';
import { entityChoiceGroups, entityChoicePart } from '@/lib/search/parsedEdit';
import {
    coverageSummary,
    noDataCallout,
    noDataText,
    primaryStatVarLabel,
    shapeOrigin,
    statVarsUnreadable,
} from '@/lib/search/view';
import { knownPart, type ParsedPart, type Part, type PartSpec } from '@/lib/search/types';

// A card's meta line, its coverage then its origin (specOrigin beside the
// spec's own sentence, shapeOrigin beside any other title). The line clamps
// at two lines, so the full text goes in the title attribute.
const CardMeta = ({ spec, origin }: { spec: PartSpec; origin: string | null }) => {
    const meta = [coverageSummary(spec), origin].filter(Boolean).join(' · ');

    return (
        <span className={styles.cardMeta} title={meta}>
            {meta}
        </span>
    );
};

// The outcomes of a no_data part, shown outside the sentence itself: its
// nearest subsets, a flagged or alternate-variable callout, or the Studio
// handoff. Any other part, an unsupported one included, renders nothing. A part whose slot token already offers its own picker
// (entity_ambiguous with a marked token) renders nothing here, since a second
// picker would duplicate it. A single-part plan has no slot token, so this is
// its only picker. A candidates part of an answer draws ReadingCards instead.
// Takes one part, which DataSearch picks out of the response.
const SearchCards = ({
    part: givenPart,
    partIndex,
    onPick,
    onEditParsed,
    onStudio,
    question,
}: {
    part: Part | null;
    partIndex: number;
    onPick: (text?: string) => void;
    // Posts an entity_ambiguous pick as a parsed entry, the single-part
    // plan's escape hatch when there's no slot token to hang a picker off.
    onEditParsed: (partIndex: number, editedPart: ParsedPart) => void;
    // Hands the question and the datasets on screen to Studio (DataSearch's
    // openStudio), shown by the no_data Studio callout's button.
    onStudio: () => void;
    // The user's own question, read by noDataCallout and re-run by an
    // unreadable subset's retry.
    question: string;
}) => {
    const part = knownPart(givenPart);

    if (part?.status === 'no_data') {
        // The entity_ambiguous picker of a part with no slot token to hang
        // it off. A pick posts the refusal's option for it unchanged as a
        // parsed entry (entityChoicePart). The same test as
        // offersAmbiguousPicker, on a part already known to be no_data.
        const groups = entityChoiceGroups(part.no_data);

        if (groups.length > 0) {
            return (
                <div className={styles.cardsBlock}>
                    <p className={styles.cardsTitle}>Choose a Match</p>
                    <div className={styles.cards}>
                        {groups.flatMap((group) =>
                            group.options.map((option, index) => (
                                <button
                                    key={`${group.key}:${index}`}
                                    type="button"
                                    className={styles.card}
                                    style={{ '--i': index } as React.CSSProperties}
                                    onClick={() => {
                                        const posted = entityChoicePart(option);

                                        if (posted) onEditParsed(partIndex, posted);
                                    }}
                                >
                                    <span className={styles.cardTitle}>{option.label}</span>
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
                    <Button icon="arrow" wide onClick={onStudio}>
                        Open Studio
                    </Button>
                </div>
            );
        }

        return (
            <div className={styles.cardsBlock}>
                <p className={styles.cardsTitle}>Largest Subsets</p>
                <div className={styles.cards}>
                    {nearest.map((spec, index) => {
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
