'use client';

import classNames from 'classnames';

import { BreakableId } from './BreakableId';
import { ExploreLink } from './ExploreLink';
import FocusEntry, { useLens } from './FocusEntry';
import styles from './FocusPicture.module.scss';
import { JoinPhrase } from './JoinPhrase';
import { count } from '@/lib/graphExplorer/counts';

import {
    BOX_LIMIT,
    headsOf,
    linkShape,
    type End,
    type FocusBox,
    type Side,
} from '@/lib/graphExplorer/focus';

type FocusPictureProps = {
    /** The centre: what it is, its name (the page's heading) and a line under it. */
    kind: string;
    name: React.ReactNode;
    sub: string | null;
    boxes: readonly FocusBox[];
    /** The class whose scoped list a box with `more: 'list'` opens. */
    listClass: string | null;
    /** How many properties the class declares that no dataset uses yet. */
    unused: number;
    /** The chosen dataset of the filter, or null. */
    lensDataset: string | null;
    lensLabel: string | null;
    /** Opens a box's full list in the panel. */
    onOpen: (key: string) => void;
};

type Heads = readonly [End | null, End | null];

/**
 * One half of a join's line. `wide` and `stacked` place its arrowhead, if any,
 * in each layout.
 */
const Segment = ({
    wide,
    stacked,
    dashed,
}: {
    wide: End | null;
    stacked: End | null;
    dashed: boolean;
}) => (
    <span
        aria-hidden="true"
        className={classNames(
            styles.segment,
            dashed && styles.dashed,
            wide === 'start' && styles.headStart,
            wide === 'end' && styles.headEnd,
            stacked === 'start' && styles.stackStart,
            stacked === 'end' && styles.stackEnd,
        )}
    />
);

/** Whether the half of a join at the centre's end has a head pointing at the centre. */
const pointsAtCentre = (heads: Heads, boxFirst: boolean): boolean =>
    boxFirst ? heads[1] === 'end' : heads[0] === 'start';

const intoCentre = (box: FocusBox, boxFirst: boolean): boolean =>
    pointsAtCentre(headsOf(linkShape(box.via), boxFirst), boxFirst);

/**
 * The line between a box and the centre, with its words. In the wide layout
 * `boxFirst` says whether the box sits above or left of the join, and a join
 * above or below the centre that points at it leaves its head to the line the
 * centre draws to its card. In the stacked layout every join runs from the
 * spine on the left to its box. A chain's dashed line carries a dot at its
 * midpoint.
 */
const Join = ({
    box,
    vertical,
    boxFirst,
}: {
    box: FocusBox;
    vertical: boolean;
    boxFirst: boolean;
}) => {
    const shape = linkShape(box.via);
    const heads = headsOf(shape, boxFirst);
    const wide: Heads =
        vertical && pointsAtCentre(heads, boxFirst)
            ? boxFirst
                ? [heads[0], null]
                : [null, heads[1]]
            : heads;
    const stacked = headsOf(shape, false);
    return (
        <div
            className={classNames(
                vertical ? styles.vjoin : styles.hjoin,
                shape.dashed && styles.chain,
            )}
        >
            <Segment wide={wide[0]} stacked={stacked[0]} dashed={shape.dashed} />
            {shape.dashed && <span className={styles.dot} aria-hidden="true" />}
            <span className={styles.phrase}>
                <JoinPhrase phrase={box.join} triple={box.triple} note={box.note} />
            </span>
            <Segment wide={wide[1]} stacked={stacked[1]} dashed={shape.dashed} />
        </div>
    );
};

/** What the two kinds of line mean, for the kinds the picture draws. */
const Legend = ({ boxes }: { boxes: readonly FocusBox[] }) => {
    const shapes = boxes.map((box) => linkShape(box.via));
    const solid = shapes.some((shape) => !shape.dashed);
    const dashed = shapes.some((shape) => shape.dashed);
    if (!solid && !dashed) return null;
    return (
        <ul className={styles.legend}>
            {solid && (
                <li>
                    <span className={styles.sample} aria-hidden="true" />
                    One arc, pointing from subject to object
                </li>
            )}
            {dashed && (
                <li>
                    <span
                        className={classNames(styles.sample, styles.sampleChain)}
                        aria-hidden="true"
                    />
                    A path through StatVars or a value list, at the dot
                </li>
            )}
        </ul>
    );
};

/** One box: its title, its first entries, and "All N" when it holds more. */
const Box = ({
    box,
    listClass,
    lensDataset,
    lensLabel,
    onOpen,
}: { box: FocusBox } & Omit<FocusPictureProps, 'kind' | 'name' | 'sub' | 'boxes' | 'unused'>) => {
    const shown = box.ids.slice(0, BOX_LIMIT);
    const lens = useLens(lensDataset, shown);
    const more = box.ids.length > BOX_LIMIT;
    const label = `All ${count(box.ids.length)}`;

    return (
        <section className={styles.box} aria-label={box.title}>
            <p className={styles.label}>{box.title}</p>
            <p className={styles.hidden}>{box.sentence}</p>
            <ul className={styles.entries}>
                {shown.map((id) => (
                    <FocusEntry
                        key={id}
                        id={id}
                        lens={lens?.get(id) ?? null}
                        datasetLabel={lensLabel}
                        values={box.values?.get(id) ?? null}
                    />
                ))}
            </ul>
            {more &&
                (box.more === 'list' && listClass !== null ? (
                    <ExploreLink
                        view={{ kind: 'list', scope: { kind: 'class', id: listClass } }}
                        className={styles.more}
                    >
                        {label}
                    </ExploreLink>
                ) : (
                    <button type="button" className={styles.more} onClick={() => onOpen(box.key)}>
                        {label}
                    </button>
                ))}
        </section>
    );
};

/**
 * The focus picture: the centre with its boxes around it, broader terms
 * above, what it is used with on the left, what it connects to on the right
 * and narrower terms below, each box joined to the centre by a labelled
 * arrow, with a legend for the kinds of line under it. Under the right-hand
 * boxes of a class, a link to its scoped list counts the properties it
 * declares that no dataset uses yet. On a narrow screen it is one column in
 * that reading order, each box joined to a spine that runs to the centre.
 */
const FocusPicture = ({ kind, name, sub, boxes, unused, ...shared }: FocusPictureProps) => {
    const on = (side: Side) => boxes.filter((box) => box.side === side);
    const [up, left, right, down] = (['up', 'left', 'right', 'down'] as const).map(on);
    const unusedClass = unused > 0 ? shared.listClass : null;

    return (
        <div className={styles.frame}>
            <div className={classNames(styles.picture, left.length === 0 && styles.noLeft)}>
                {up.length > 0 && (
                    <div className={styles.up}>
                        {up.map((box) => (
                            <div key={box.key} className={styles.column}>
                                <Box box={box} {...shared} />
                                <Join box={box} vertical boxFirst />
                            </div>
                        ))}
                    </div>
                )}
                {left.length > 0 && (
                    <div className={styles.left}>
                        {left.map((box) => (
                            <div key={box.key} className={styles.row}>
                                <Box box={box} {...shared} />
                                <Join box={box} vertical={false} boxFirst />
                            </div>
                        ))}
                    </div>
                )}
                <div
                    className={classNames(
                        styles.centre,
                        up.length > 0 && styles.joinUp,
                        down.length > 0 && styles.joinDown,
                        up.some((box) => intoCentre(box, true)) && styles.headAbove,
                        down.some((box) => intoCentre(box, false)) && styles.headBelow,
                    )}
                >
                    <div className={styles.self}>
                        <p className={styles.kind}>{kind}</p>
                        <h1 className={styles.name}>{name}</h1>
                        {sub && (
                            <p className={styles.sub}>
                                <BreakableId text={sub} />
                            </p>
                        )}
                    </div>
                </div>
                {(right.length > 0 || unusedClass !== null) && (
                    <div className={styles.right}>
                        {right.map((box) => (
                            <div key={box.key} className={styles.row}>
                                <Join box={box} vertical={false} boxFirst={false} />
                                <Box box={box} {...shared} />
                            </div>
                        ))}
                        {unusedClass !== null && (
                            <ExploreLink
                                view={{ kind: 'list', scope: { kind: 'class', id: unusedClass } }}
                                className={styles.unused}
                            >
                                {count(unused)} more defined, not yet used by a dataset
                            </ExploreLink>
                        )}
                    </div>
                )}
                {down.length > 0 && (
                    <div className={styles.down}>
                        {down.map((box) => (
                            <div key={box.key} className={styles.column}>
                                <Join box={box} vertical boxFirst={false} />
                                <Box box={box} {...shared} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <Legend boxes={boxes} />
        </div>
    );
};

export default FocusPicture;
