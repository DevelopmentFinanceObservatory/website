'use client';

import classNames from 'classnames';

import { ExploreLink } from './ExploreLink';
import FocusEntry, { useLens } from './FocusEntry';
import styles from './FocusPicture.module.scss';
import { count } from './format';

import { BOX_LIMIT, type FocusBox, type Side } from '@/lib/graphExplorer/focus';

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

const Join = ({ text, vertical }: { text: string; vertical: boolean }) => (
    <div className={vertical ? styles.vjoin : styles.hjoin} aria-hidden="true">
        <span>{text}</span>
    </div>
);

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
 * line. Under the right-hand boxes of a class, a link to its scoped list
 * counts the properties it declares that no dataset uses yet. On a narrow
 * screen it is one column in that reading order.
 */
const FocusPicture = ({ kind, name, sub, boxes, unused, ...shared }: FocusPictureProps) => {
    const on = (side: Side) => boxes.filter((box) => box.side === side);
    const [up, left, right, down] = (['up', 'left', 'right', 'down'] as const).map(on);
    const unusedClass = unused > 0 ? shared.listClass : null;

    return (
        <div className={classNames(styles.picture, left.length === 0 && styles.noLeft)}>
            {up.length > 0 && (
                <div className={styles.up}>
                    {up.map((box) => (
                        <div key={box.key} className={styles.column}>
                            <Box box={box} {...shared} />
                            <Join text={box.join} vertical />
                        </div>
                    ))}
                </div>
            )}
            {left.length > 0 && (
                <div className={styles.left}>
                    {left.map((box) => (
                        <div key={box.key} className={styles.row}>
                            <Box box={box} {...shared} />
                            <Join text={box.join} vertical={false} />
                        </div>
                    ))}
                </div>
            )}
            <div className={styles.self}>
                <p className={styles.kind}>{kind}</p>
                <h1 className={styles.name}>{name}</h1>
                {sub && <p className={styles.sub}>{sub}</p>}
            </div>
            {(right.length > 0 || unusedClass !== null) && (
                <div className={styles.right}>
                    {right.map((box) => (
                        <div key={box.key} className={styles.row}>
                            <Join text={box.join} vertical={false} />
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
                            <Join text={box.join} vertical />
                            <Box box={box} {...shared} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FocusPicture;
