'use client';

import { useEffect, useMemo, useState } from 'react';

import { useExplore, useModel } from './ExploreContext';
import { BaseTag } from './ExploreLink';
import {
    DatasetPanel,
    FullList,
    KIND_WORDS,
    NodePanel,
    OutsidePanel,
    type PanelLens,
} from './FocusPanel';
import FocusPicture from './FocusPicture';
import styles from './FocusView.module.scss';
import { plural } from './format';

import Button from '@/components/atoms/Button/Button';
import { NO_FILTER, START_VIEW } from '@/lib/graphExplorer/explore';
import { datasetBoxes, definedNotUsed, nodeBoxes, type FocusBox } from '@/lib/graphExplorer/focus';
import type { DatasetFilter } from '@/lib/graphExplorer/model';
import type { OntologyTerms } from '@/lib/graphExplorer/wire';

type FocusViewProps = {
    /** What is centred: a term (`?node=`) or a dataset (`?dataset=`). */
    centre: { readonly kind: 'node' | 'dataset'; readonly id: string };
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

    const lens: PanelLens =
        show.kind === 'dataset'
            ? { dataset: show.id, label: model.label(show.id) }
            : { dataset: null, label: null };

    const datasetView = centre.kind === 'dataset' ? model.datasetView(centre.id) : undefined;
    const kind = centre.kind === 'node' ? model.kind(centre.id) : undefined;
    const term = useMemo(
        () =>
            centre.kind === 'node' && kind === undefined
                ? baseTerms?.terms.find((entry) => entry.dcid === centre.id)
                : undefined,
        [centre, kind, baseTerms],
    );

    const name = datasetView?.label ?? term?.name ?? model.label(centre.id);
    useDocumentTitle(name);

    if (centre.kind === 'dataset' && !datasetView) {
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

    const boxes: readonly FocusBox[] = datasetView
        ? datasetBoxes(datasetView)
        : nodeBoxes(model, centre.id);
    const openBox = boxes.find((box) => box.key === open);

    let picture: { kind: string; sub: string | null; base: boolean };
    let definition: React.ReactNode;
    if (datasetView) {
        picture = {
            kind: 'Dataset',
            sub: plural(datasetView.statVarCount, 'StatVar'),
            base: false,
        };
        definition = <DatasetPanel view={datasetView} />;
    } else if (kind) {
        const codes = model.node(centre.id)?.classification_code ?? [];
        picture = {
            kind: KIND_WORDS[kind],
            sub: codes.length > 0 ? `Code ${codes.join(', ')}` : null,
            base: model.isBase(centre.id),
        };
        definition = <NodePanel id={centre.id} lens={lens} />;
    } else {
        picture = {
            kind: term ? 'Base Data Commons' : 'Not in the DFO model',
            sub: centre.id,
            base: term?.declared_by === 'base',
        };
        definition = <OutsidePanel id={centre.id} term={term} />;
    }

    return (
        <div className={styles.work}>
            <div className={styles.stage}>
                <FilterLine lens={lens} dataset={datasetView ? datasetView.id : null} />
                <FocusPicture
                    kind={picture.kind}
                    name={<WithTag name={name} base={picture.base} />}
                    sub={picture.sub}
                    boxes={boxes}
                    listClass={kind === 'class' ? centre.id : null}
                    unused={definedNotUsed(model, centre.id)}
                    lensDataset={lens.dataset}
                    lensLabel={lens.label}
                    onOpen={setOpen}
                />
                <p className={styles.note}>
                    Select any name to put it at the centre. The back button retraces your steps.
                    {lens.dataset !== null &&
                        ` Names ${lens.label} uses carry its StatVar count; the rest are dimmed.`}
                </p>
            </div>
            <aside className={styles.panel} aria-label={openBox ? openBox.title : 'Definition'}>
                {openBox ? (
                    <FullList box={openBox} lens={lens} onClose={() => setOpen(null)} />
                ) : (
                    definition
                )}
            </aside>
        </div>
    );
};

export default FocusView;
