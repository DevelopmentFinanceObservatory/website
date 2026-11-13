'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useExplore, useModel } from './ExploreContext';
import { BaseTag } from './ExploreLink';
import { DatasetPanel, FullList, NodePanel, OutsidePanel, type PanelLens } from './FocusPanel';
import FocusPicture from './FocusPicture';
import styles from './FocusView.module.scss';
import { plural } from './format';

import Button from '@/components/atoms/Button/Button';
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
import type { DatasetFilter } from '@/lib/graphExplorer/model';
import type { OntologyTerms } from '@/lib/graphExplorer/wire';

type FocusViewProps = {
    centre: Centre;
    /** The dataset filter, already checked against the model's datasets. */
    show: DatasetFilter;
    /** The base Data Commons terms list, when the search switch has loaded it. */
    baseTerms?: OntologyTerms;
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

const WithTag = ({ name, base }: { name: string; base: boolean }) => (
    <>
        {name}
        {base && (
            <>
                {' '}
                <BaseTag />
            </>
        )}
    </>
);

/**
 * The dataset filter as one line: while a dataset is chosen, what it shows
 * and a way to clear it; on a dataset's own view without it, a way to choose
 * that dataset.
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
 * One term or dataset at the centre: the dataset filter's line, the focus picture
 * and the panel beside it with the definition, or with a box's full list
 * while one is open.
 */
const FocusView = ({ centre, show, baseTerms }: FocusViewProps) => {
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

    const heading = useMemo(
        () => centreHeading(model, centre, baseTerms),
        [model, centre, baseTerms],
    );
    useDocumentTitle(heading?.name ?? centre.id);

    if (heading === null) {
        return (
            <div className={styles.missing} role="status">
                <p>
                    The model has no dataset <code>{centre.id}</code>.
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
                <FilterLine lens={lens} dataset={datasetView ? datasetView.id : null} />
                <FocusPicture
                    kind={heading.kind}
                    name={<WithTag name={heading.name} base={heading.base} />}
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
                        ` Names ${markLens.label} uses carry its StatVar count; the rest are dimmed.`}
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

export default FocusView;
