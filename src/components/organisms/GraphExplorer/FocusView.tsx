'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { BreakableId } from './BreakableId';
import { ModelProvider, useExplore, useModel } from './ExploreContext';
import { OriginTag } from './ExploreLink';
import { DatasetPanel, FullList, NodePanel, TermPanel, type PanelLens } from './FocusPanel';
import FocusPicture from './FocusPicture';
import styles from './FocusView.module.scss';
import { useTermSources } from './ListToggle';
import { useNodeView } from './useNodeView';

import Button from '@/components/atoms/Button/Button';
import Spinner from '@/components/atoms/Spinner/Spinner';
import { plural } from '@/lib/graphExplorer/counts';
import { NO_FILTER, START_VIEW } from '@/lib/graphExplorer/explore';
import {
    centreHeading,
    datasetBoxes,
    definedNotUsed,
    nodeBoxes,
    pictureLens,
    type Centre,
    type CentreSub,
    type FocusBox,
} from '@/lib/graphExplorer/focus';
import { outsideTerm } from '@/lib/graphExplorer/lists';
import { waitText, type Waiting } from '@/lib/graphExplorer/load';
import type { DatasetFilter, Model } from '@/lib/graphExplorer/model';
import {
    boxGaps,
    COMPLETE,
    needsNodeView,
    pictureCuts,
    routeCentre,
    type CentreLine,
    type Completeness,
    type NodeViewFailure,
    type RefusalKind,
} from '@/lib/graphExplorer/nodeView';

type FocusViewProps = {
    centre: Centre;
    /** The dataset filter, already checked against the full model's datasets. */
    show: DatasetFilter;
    /** The full model, over every usage document loaded. */
    full: Model;
};

type CentredProps = Omit<FocusViewProps, 'full'> & {
    /** The node view's failure or refusal, for the line over the picture, or null. */
    line: CentreLine | null;
    /** Loads the node view again, from the failure line. */
    onRetry: () => void;
    /** How completely the model holds the centre's links. */
    completeness: Completeness;
    /** The centre's heading, which takes focus when a retried node view lands. */
    headingRef: React.Ref<HTMLHeadingElement>;
};

/** Names the centred term in the document title while it is centred. */
const useDocumentTitle = (name: string) => {
    useEffect(() => {
        const previous = document.title;
        document.title = `${name} · ${previous}`;
        return () => {
            document.title = previous;
        };
    }, [name]);
};

const subText = (sub: CentreSub | null): string | null => {
    if (sub === null) return null;
    if (sub.kind === 'statVars') return plural(sub.count, 'StatVar');
    if (sub.kind === 'codes') return `Code ${sub.codes.join(', ')}`;
    return sub.id;
};

/**
 * The dataset filter as one line. While a dataset is chosen, the line says
 * what it shows and offers a way to clear it. On a dataset's own view with no
 * filter, it offers a way to choose that dataset.
 */
const FilterLine = ({ lens, dataset }: { lens: PanelLens; dataset: string | null }) => {
    const { setShow } = useExplore();

    if (lens.dataset !== null) {
        return (
            <p className={styles.filter} role="status">
                <span>Showing what {lens.label} uses</span>
                <Button variant="bordered" small onClick={() => setShow(NO_FILTER)}>
                    Clear
                </Button>
            </p>
        );
    }
    if (dataset === null) return null;
    return (
        <div>
            <Button
                variant="bordered"
                small
                onClick={() => setShow({ kind: 'dataset', id: dataset })}
            >
                Show Only What This Dataset Uses
            </Button>
        </div>
    );
};

/**
 * One term or dataset at the centre, drawn from the model `useModel` reads:
 * the line over the picture (CentreNotice), the dataset filter's line, the
 * focus picture and the panel beside it with the definition, or with a
 * box's full list while one is open.
 */
const Centred = ({ centre, show, line, onRetry, completeness, headingRef }: CentredProps) => {
    const model = useModel();
    const sources = useTermSources();
    const { go } = useExplore();
    const [open, setOpen] = useState<string | null>(null);
    // The "All N" control that opened the full list, which takes focus back on close.
    const opener = useRef<HTMLElement | null>(null);

    const lens: PanelLens =
        show.kind === 'dataset'
            ? { dataset: show.id, label: model.label(show.id) }
            : { dataset: null, label: null };
    const marked = pictureLens(centre, show);
    const markLens: PanelLens = marked === null ? { dataset: null, label: null } : lens;

    const heading = useMemo(() => centreHeading(model, centre, sources), [model, centre, sources]);
    useDocumentTitle(heading?.name ?? centre.id);

    if (heading === null) {
        return (
            <div className={styles.missing} role="status">
                <p>
                    The model has no dataset{' '}
                    <code>
                        <BreakableId text={centre.id} />
                    </code>
                    .
                </p>
                <div>
                    <Button onClick={() => go(START_VIEW)}>Start</Button>
                </div>
            </div>
        );
    }

    const datasetView = centre.kind === 'dataset' ? model.datasetView(centre.id) : undefined;
    const kind = centre.kind === 'node' ? model.kind(centre.id) : undefined;
    const boxes: readonly FocusBox[] = datasetView
        ? datasetBoxes(datasetView)
        : nodeBoxes(model, centre.id);
    const openBox = boxes.find((box) => box.key === open);

    const definition = datasetView ? (
        <DatasetPanel view={datasetView} />
    ) : kind ? (
        <NodePanel id={centre.id} lens={lens} completeness={completeness} />
    ) : (
        <TermPanel id={centre.id} lens={lens} />
    );

    const openList = (key: string) => {
        opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(key);
    };
    const closeList = () => {
        setOpen(null);
        opener.current?.focus();
    };

    return (
        <div className={styles.work}>
            <div className={styles.stage}>
                <CentreNotice
                    id={centre.id}
                    name={model.label(centre.id)}
                    line={line}
                    completeness={completeness}
                    cuts={pictureCuts(model, centre.id, boxes, completeness)}
                    onRetry={onRetry}
                />
                <FilterLine lens={lens} dataset={datasetView ? datasetView.id : null} />
                {/* Keyed by the centre, so a bubble pinned open on one centre closes on the next. */}
                <FocusPicture
                    key={`${centre.kind}:${centre.id}`}
                    headingRef={headingRef}
                    kind={heading.kind}
                    name={
                        <>
                            {heading.name}
                            <OriginTag declaredBy={heading.declaredBy} />
                        </>
                    }
                    sub={subText(heading.sub)}
                    boxes={boxes}
                    listClass={kind === 'class' ? centre.id : null}
                    unused={definedNotUsed(model, centre.id)}
                    lensDataset={markLens.dataset}
                    lensLabel={markLens.label}
                    onOpen={openList}
                />
                <p className={styles.note}>
                    Select any name to put it at the centre. The back button retraces your steps.
                    {markLens.dataset !== null &&
                        ` Names ${markLens.label} uses carry its StatVar count. The rest are dimmed.`}
                </p>
            </div>
            <aside className={styles.panel} aria-label={openBox ? openBox.title : 'Definition'}>
                {openBox ? (
                    <FullList
                        key={`${centre.id}:${openBox.key}`}
                        box={openBox}
                        lens={markLens}
                        gaps={boxGaps(openBox, centre.id, completeness)}
                        onClose={closeList}
                    />
                ) : (
                    definition
                )}
            </aside>
        </div>
    );
};

/**
 * The line over a picture drawn without its node view, offering to load the
 * view again. While a retry loads, the line says so and its button stays in
 * place, so focus stays on it.
 */
export const FailedLine = ({
    failure,
    retrying,
    onRetry,
}: {
    failure: NodeViewFailure;
    retrying: boolean;
    onRetry: () => void;
}) => (
    <p className={styles.filter} role="alert">
        <span>
            Its links on the graph could not be loaded.{' '}
            {retrying ? 'Loading them again.' : failure.explanation}
        </span>
        <Button
            variant="bordered"
            small
            aria-disabled={retrying}
            onClick={retrying ? undefined : onRetry}
        >
            Try Again
        </Button>
    </p>
);

/** Each name in quotes, joined with commas and a final "and". */
const quotedList = (names: readonly string[]): string => {
    const quoted = names.map((name) => `\u201c${name}\u201d`);
    if (quoted.length <= 2) return quoted.join(' and ');
    return `${quoted.slice(0, -1).join(', ')}, and ${quoted.at(-1)}`;
};

/** What the line over a picture says is cut, as pictureCuts reads it. */
type PictureCuts = ReturnType<typeof pictureCuts>;

const NO_CUTS: PictureCuts = { lists: [], walk: false };

/**
 * The line over a picture drawn from a model that may hold less than the
 * graph: the node view loading or unavailable, the drawn lists a capped
 * listing cuts (`cuts.lists`), or the walk down the class tree stopped
 * (`cuts.walk`). Nothing for a complete model, or when no drawn list is cut.
 */
const CompletenessLine = ({
    name,
    completeness,
    cuts,
}: {
    name: string;
    completeness: Completeness;
    cuts: PictureCuts;
}) => {
    if (completeness.state === 'complete') return null;
    if (completeness.state === 'unresolved') {
        return (
            <p className={styles.filter} role="status">
                <span>
                    {completeness.loading
                        ? 'Loading its links on the graph.'
                        : 'Its links on the graph are not available here.'}
                </span>
            </p>
        );
    }
    if (cuts.lists.length === 0 && !cuts.walk) return null;
    const one = cuts.lists.length === 1;
    return (
        <p className={styles.filter} role="status">
            <span>
                {cuts.lists.length > 0 &&
                    `The ${one ? 'list' : 'lists'} ${quotedList(cuts.lists)} ${one ? 'is' : 'are'} cut short. The graph holds more links than one view reads. `}
                {cuts.walk &&
                    `Counts over narrower kinds of ${name} leave some out. The graph holds more of them than one view reads.`}
            </span>
        </p>
    );
};

/**
 * What a refusal says about the term whose dcid is `id`: as the line over
 * a picture or list drawn without its node view (`drawn`), or as a screen
 * that shows nothing else.
 */
const RefusalText = ({
    refusal,
    id,
    drawn,
}: {
    refusal: RefusalKind;
    id: string;
    drawn: boolean;
}) => {
    const term = (
        <code>
            <BreakableId text={id} />
        </code>
    );
    switch (refusal) {
        case 'notHeld':
            return <>{term} is not on the graph.</>;
        case 'notServed':
            return drawn ? (
                <>
                    The Graph API here does not serve term views, so what is shown leaves out its
                    other links on the graph.
                </>
            ) : (
                <>
                    The Graph API here does not serve term views, and nothing else here describes{' '}
                    {term}.
                </>
            );
        case 'originNotServed':
            return <>The UN System Data Commons is not served here.</>;
        case 'notAdvancing':
            return <>The graph could not finish reading {term}.</>;
        case 'tooLarge':
            return drawn ? (
                <>The graph holds too many links for it to load here.</>
            ) : (
                <>The graph&rsquo;s view of {term} is too large to show here.</>
            );
    }
};

/** The line over a picture or list drawn without its node view, after the view was refused. */
const RefusedLine = ({ refusal, id }: { refusal: RefusalKind; id: string }) => (
    <p className={styles.filter} role="status">
        <span>
            <RefusalText refusal={refusal} id={id} drawn />
        </span>
    </p>
);

/**
 * The line over a centre's picture: its node view's failure or refusal, or
 * else what its model may leave out (`completeness`, complete by default
 * for a screen that marks its own list) and which drawn lists are cut
 * (`cuts`).
 */
export const CentreNotice = ({
    id,
    name,
    line,
    completeness = COMPLETE,
    cuts = NO_CUTS,
    onRetry,
}: {
    id: string;
    name: string;
    line: CentreLine | null;
    completeness?: Completeness;
    cuts?: PictureCuts;
    onRetry: () => void;
}) => {
    if (line?.kind === 'failed') {
        return <FailedLine failure={line.failure} retrying={line.retrying} onRetry={onRetry} />;
    }
    if (line?.kind === 'refused') return <RefusedLine refusal={line.refusal} id={id} />;
    return <CompletenessLine name={name} completeness={completeness} cuts={cuts} />;
};

/** The screen while the node view of a term the DFO document lacks loads, or waits before a retry. */
export const ViewLoading = ({ id, waiting }: { id: string; waiting: Waiting | null }) => (
    <div className={styles.loading} role="status">
        <Spinner size={24} label="Loading" />
        <p className={styles.note}>
            {waiting === null ? (
                <>
                    Loading{' '}
                    <code>
                        <BreakableId text={id} />
                    </code>{' '}
                    from the graph.
                </>
            ) : (
                waitText(waiting.retryInMs, waiting.cause)
            )}
        </p>
    </div>
);

/**
 * A term whose node view was refused for good, with a way back to the
 * start. Its text takes focus through `textRef` when a retry ends here.
 */
export const Refused = ({
    id,
    refusal,
    textRef,
}: {
    id: string;
    refusal: RefusalKind;
    textRef?: React.Ref<HTMLParagraphElement>;
}) => {
    const { go } = useExplore();
    return (
        <div className={styles.missing} role="status">
            <p ref={textRef} tabIndex={-1}>
                <RefusalText refusal={refusal} id={id} drawn={false} />
            </p>
            <div>
                <Button onClick={() => go(START_VIEW)}>Start</Button>
            </div>
        </div>
    );
};

/**
 * Focus after Try Again, whose button unmounts once the retried node view
 * settles. Focus goes to the screen's heading (`heading`) when it draws
 * one, else to the text of the refusal or missing screen it ends on
 * (`text`). `onRetry` loads the view again through `retry`. `failing` is
 * true while the screen shows the view's failure line.
 */
export const useRetryFocus = (failing: boolean, retry: () => void) => {
    const heading = useRef<HTMLHeadingElement | null>(null);
    const text = useRef<HTMLParagraphElement | null>(null);
    const retried = useRef(false);

    useEffect(() => {
        if (!retried.current || failing) return;
        retried.current = false;
        (heading.current ?? text.current)?.focus();
    }, [failing]);

    const onRetry = () => {
        retried.current = true;
        retry();
    };
    return { heading, text, onRetry };
};

/**
 * A centred term or dataset, drawn from the model its route names. A
 * dataset or a term the DFO document declares draws from the full model.
 * Any other term loads its node view: a term the document holds (Person)
 * paints from the full model at once and redraws when the view lands; a
 * term it lacks waits for the view. A refused view reads "not on the
 * graph" or "not served here", beside the term's heading and use when the
 * usage documents name it or a loaded terms list holds it. A failed view
 * keeps what the full model shows, with a line that loads it again, and
 * the heading or the refusal takes focus once a retried view settles
 * (`useRetryFocus`). The line over the picture says what the model may
 * leave out (`Completeness`).
 */
const FocusView = ({ centre, show, full }: FocusViewProps) => {
    const sources = useTermSources();
    const { state, lastFailure, retry } = useNodeView(
        needsNodeView(full, centre) ? centre.id : null,
    );
    const listed = centre.kind === 'node' && outsideTerm(sources.terms, centre.id) !== undefined;
    const route = routeCentre(full, centre, state, { lastFailure, listed });
    const failing = route.kind === 'draw' && route.line?.kind === 'failed';
    const { heading, text, onRetry } = useRetryFocus(failing, retry);

    switch (route.kind) {
        case 'loading':
            return <ViewLoading id={centre.id} waiting={route.waiting} />;
        case 'refused':
            return <Refused id={centre.id} refusal={route.refusal} textRef={text} />;
        case 'draw':
            return (
                <ModelProvider value={route.model}>
                    <Centred
                        centre={centre}
                        show={show}
                        line={route.line}
                        onRetry={onRetry}
                        completeness={route.completeness}
                        headingRef={heading}
                    />
                </ModelProvider>
            );
    }
};

export default FocusView;
