'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { BreakableId } from './BreakableId';
import { ModelProvider, useExplore, useModel } from './ExploreContext';
import { OriginTag } from './ExploreLink';
import { DatasetPanel, FullList, NodePanel, OutsidePanel, type PanelLens } from './FocusPanel';
import FocusPicture from './FocusPicture';
import styles from './FocusView.module.scss';
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
import { waitText, type Waiting } from '@/lib/graphExplorer/load';
import type { DatasetFilter, Model } from '@/lib/graphExplorer/model';
import { needsNodeView, routeCentre, type NodeViewFailure } from '@/lib/graphExplorer/nodeView';
import type { SchemaTerm } from '@/lib/graphExplorer/wire';

type FocusViewProps = {
    centre: Centre;
    /** The dataset filter, already checked against the full model's datasets. */
    show: DatasetFilter;
    /** The full model, over every usage document loaded. */
    full: Model;
    /** The terms lists whose switches are on and that have loaded. */
    outside?: readonly SchemaTerm[];
};

type CentredProps = Omit<FocusViewProps, 'full'> & {
    /** A line over the picture, or null. */
    notice: React.ReactNode;
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
 * the notice, the dataset filter's line, the focus picture and the panel
 * beside it with the definition, or with a box's full list while one is open.
 */
const Centred = ({ centre, show, outside, notice }: CentredProps) => {
    const model = useModel();
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

    const heading = useMemo(() => centreHeading(model, centre, outside), [model, centre, outside]);
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
        <NodePanel id={centre.id} lens={lens} />
    ) : (
        <OutsidePanel id={centre.id} term={heading.term} />
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
                {notice}
                <FilterLine lens={lens} dataset={datasetView ? datasetView.id : null} />
                {/* Keyed by the centre, so a bubble pinned open on one centre closes on the next. */}
                <FocusPicture
                    key={`${centre.kind}:${centre.id}`}
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
                    <FullList box={openBox} lens={markLens} onClose={closeList} />
                ) : (
                    definition
                )}
            </aside>
        </div>
    );
};

/** The line over a picture drawn without its node view, offering to load the view again. */
const FailedLine = ({ failure, onRetry }: { failure: NodeViewFailure; onRetry: () => void }) => (
    <p className={styles.filter} role="alert">
        <span>Its links on the graph could not be loaded. {failure.explanation}</span>
        <Button variant="bordered" small onClick={onRetry}>
            Try Again
        </Button>
    </p>
);

/** The screen while the node view of a term the DFO document lacks loads, or waits before a retry. */
const ViewLoading = ({ id, waiting }: { id: string; waiting: Waiting | null }) => (
    <div className={styles.loading}>
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

/** A term whose node view was refused for good, with a way back to the start. */
const Refused = ({ id, notHeld }: { id: string; notHeld: boolean }) => {
    const { go } = useExplore();
    const term = (
        <code>
            <BreakableId text={id} />
        </code>
    );
    return (
        <div className={styles.missing} role="status">
            <p>
                {notHeld ? (
                    <>{term} is not on the graph.</>
                ) : (
                    <>The graph that holds {term} is not served here.</>
                )}
            </p>
            <div>
                <Button onClick={() => go(START_VIEW)}>Start</Button>
            </div>
        </div>
    );
};

/**
 * A centred term or dataset, drawn from the model its route names. A
 * dataset or a term the DFO document declares draws from the full model.
 * Any other term loads its node view: a term the document holds (Person)
 * paints from the full model at once and redraws when the view lands; a
 * term it lacks waits for the view, and reads "not on the graph" or "not
 * served here" when the view is refused. A failed view keeps what the full
 * model shows, with a line that loads it again.
 */
const FocusView = ({ centre, show, full, outside }: FocusViewProps) => {
    const { state, retry } = useNodeView(needsNodeView(full, centre) ? centre.id : null);
    const route = routeCentre(full, centre, state);

    switch (route.kind) {
        case 'loading':
            return <ViewLoading id={centre.id} waiting={route.waiting} />;
        case 'notHeld':
        case 'notServed':
            return <Refused id={centre.id} notHeld={route.kind === 'notHeld'} />;
        case 'draw':
            return (
                <ModelProvider value={route.model}>
                    <Centred
                        centre={centre}
                        show={show}
                        outside={outside}
                        notice={
                            route.failed && <FailedLine failure={route.failed} onRetry={retry} />
                        }
                    />
                </ModelProvider>
            );
    }
};

export default FocusView;
