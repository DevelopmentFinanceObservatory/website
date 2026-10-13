'use client';

import { useEffect, useState } from 'react';

import styles from './DataSearch.module.scss';
import type { PartlessAnswer } from './useSearchRun';

import Button from '@/components/atoms/Button/Button';
import TryChips from '@/components/molecules/TryChips/TryChips';
import {
    declinedExamples,
    placeScopeLine,
    scopeLine,
    type CatalogueExample,
    type PlaceCatalogue,
    type SearchCatalogue,
} from '@/lib/search/catalogue';
import { fetchSearchCatalogue } from '@/lib/search/searchClient';
import type { GraphRef } from '@/lib/search/types';

/** One country's catalogue from `?place=`, and whether it is still on its
 *  way. No place reads nothing. */
const usePlaceCatalogue = (place: string | null) => {
    const [loaded, setLoaded] = useState<{
        place: string;
        catalogue: PlaceCatalogue | null;
    } | null>(null);

    useEffect(() => {
        if (!place) {
            return;
        }

        const controller = new AbortController();

        void fetchSearchCatalogue(place, controller.signal).then((catalogue) => {
            if (!controller.signal.aborted) {
                setLoaded({ place, catalogue });
            }
        });

        return () => controller.abort();
    }, [place]);

    const current = place && loaded?.place === place ? loaded : null;

    return { placeCatalogue: current?.catalogue ?? null, pending: !!place && !current };
};

/** The answer's actions row: an optional lead action, Start New, then a
 *  quiet arrow that runs the catalogue query or links to the source list. */
const AnswerActions = ({
    lead,
    onStartNew,
    away,
}: {
    lead?: React.ReactNode;
    onStartNew: () => void;
    away: { label: string } & ({ run: () => void } | { href: string });
}) => (
    <div className={styles.actions}>
        {lead}
        <Button variant="outline" onClick={onStartNew}>
            Start New
        </Button>
        {'href' in away ? (
            <Button variant="plain" icon="arrow" className={styles.quietAction} href={away.href}>
                {away.label}
            </Button>
        ) : (
            <Button variant="plain" icon="arrow" className={styles.quietAction} onClick={away.run}>
                {away.label}
            </Button>
        )}
    </div>
);

/** The examples as the landing's Try chips. A click runs the sentence. */
const AnswerExamples = ({
    examples,
    onRun,
}: {
    examples: CatalogueExample[];
    onRun: (text: string) => void;
}) =>
    examples.length > 0 ? (
        <TryChips
            examples={examples.map((example) => example.text)}
            onPick={onRun}
            className={styles.answerTry}
        />
    ) : null;

/** The starting point: what DFO holds and example sentences, for the whole
 *  catalogue or, with a place, for one country from `?place=`. */
const StartingPoint = ({
    catalogue,
    place,
    onRun,
    onStartNew,
}: {
    catalogue: SearchCatalogue | null;
    place: GraphRef | null;
    onRun: (text: string) => void;
    onStartNew: () => void;
}) => {
    const { placeCatalogue, pending } = usePlaceCatalogue(place?.ref ?? null);
    const examples = (place ? placeCatalogue : catalogue)?.examples ?? [];

    return (
        <>
            <div className={styles.startingPoint}>
                {place && <h2 className={styles.startingTitle}>Data on {place.label}</h2>}
                {pending ? (
                    <p className={styles.stepsLine} aria-live="polite">
                        Reading the catalogue…
                    </p>
                ) : (
                    <p className={styles.scopeLine}>
                        {place
                            ? placeScopeLine(placeCatalogue?.counts ?? null, place.label)
                            : scopeLine(catalogue?.counts ?? null)}
                    </p>
                )}
                <AnswerActions
                    onStartNew={onStartNew}
                    away={{ label: 'See every source', href: '/data/sources' }}
                />
            </div>
            <AnswerExamples examples={examples} onRun={onRun} />
        </>
    );
};

/** out_of_scope: the scope of DFO and three examples to run instead. */
const OutOfScope = ({
    catalogue,
    place,
    onRun,
    onStartNew,
    onShowCatalogue,
}: {
    catalogue: SearchCatalogue | null;
    place: string | null;
    onRun: (text: string) => void;
    onStartNew: () => void;
    onShowCatalogue: () => void;
}) => {
    const { placeCatalogue, pending } = usePlaceCatalogue(place);
    const examples = pending ? [] : declinedExamples(catalogue, placeCatalogue);

    return (
        <>
            <div className={styles.callout}>
                <p className={styles.calloutTitle}>That’s outside what DFO covers.</p>
                <p className={styles.calloutText}>
                    DFO answers questions about development finance and the data around it, such as
                    aid, debt, health, population and the economy.
                </p>
                <AnswerActions
                    onStartNew={onStartNew}
                    away={{ label: 'See what data DFO holds', run: onShowCatalogue }}
                />
            </div>
            <AnswerExamples examples={examples} onRun={onRun} />
        </>
    );
};

/** requires_analysis: search holds no data to show, so Studio takes it. */
const RequiresAnalysis = ({
    onStudio,
    onStartNew,
    onShowCatalogue,
}: {
    onStudio: () => void;
    onStartNew: () => void;
    onShowCatalogue: () => void;
}) => (
    <div className={styles.callout}>
        <p className={styles.calloutTitle}>This question needs analysis.</p>
        <p className={styles.calloutText}>
            Search finds and downloads data. Studio can plan the analysis, run it and show its
            working.
        </p>
        <AnswerActions
            lead={
                <Button icon="arrow" onClick={onStudio}>
                    Ask in Studio
                </Button>
            }
            onStartNew={onStartNew}
            away={{ label: 'See what data DFO holds', run: onShowCatalogue }}
        />
    </div>
);

/**
 * The body of an answer with no parts, under the page's "Your Query" heading:
 * the starting point for a catalogue answer, a callout for a declined one,
 * each with an actions row led by Start New and the examples as Try chips.
 * Examples come from the catalogue the page loaded on the server, or from
 * `?place=` when the answer names a confirmed country.
 */
const SearchAnswer = ({
    answer,
    catalogue,
    onRun,
    onStartNew,
    onShowCatalogue,
    onStudio,
}: {
    answer: PartlessAnswer;
    catalogue: SearchCatalogue | null;
    // Runs an example sentence as a fresh search.
    onRun: (text: string) => void;
    // Returns to the landing with an empty, focused prompt.
    onStartNew: () => void;
    // Shows the whole catalogue's starting point, with no search call.
    onShowCatalogue: () => void;
    // Hands the question to Studio.
    onStudio: () => void;
}) => {
    const place = answer.scope.place;

    if (answer.kind === 'catalogue') {
        return (
            <StartingPoint
                catalogue={catalogue}
                place={place}
                onRun={onRun}
                onStartNew={onStartNew}
            />
        );
    }

    if (answer.reason === 'requires_analysis') {
        return (
            <RequiresAnalysis
                onStudio={onStudio}
                onStartNew={onStartNew}
                onShowCatalogue={onShowCatalogue}
            />
        );
    }

    return (
        <OutOfScope
            catalogue={catalogue}
            place={place?.ref ?? null}
            onRun={onRun}
            onStartNew={onStartNew}
            onShowCatalogue={onShowCatalogue}
        />
    );
};

export default SearchAnswer;
