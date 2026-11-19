'use client';

import Link from 'next/link';

import { useCarried, useModel, useOptionalExplore } from './ExploreContext';
import styles from './ExploreLink.module.scss';
import { useListOrigins } from './ListToggle';

import { exploreHref, type ExploreView } from '@/lib/graphExplorer/explore';

type ExploreLinkProps = {
    view: ExploreView;
    children: React.ReactNode;
    className?: string;
    /** Marks the link as the screen on show. */
    current?: boolean;
};

/**
 * A link to an Explore view. Inside GraphExplorer a plain click moves within
 * the page through history and a modified click (new tab, new window)
 * follows the href. A plain anchor keeps Next from prefetching the dynamic
 * page for every link. Outside it (the sheet pages) the link navigates to
 * the Explore page. Either way it keeps the carried parameters.
 */
export const ExploreLink = ({ view, children, className, current }: ExploreLinkProps) => {
    const navigation = useOptionalExplore();
    const carried = useCarried();
    const ariaCurrent = current ? 'page' : undefined;

    if (!navigation) {
        return (
            <Link
                href={exploreHref({ view, ...carried })}
                prefetch={false}
                className={className}
                aria-current={ariaCurrent}
            >
                {children}
            </Link>
        );
    }

    const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) {
            return;
        }
        event.preventDefault();
        navigation.go(view);
    };

    return (
        <a
            href={navigation.hrefFor(view)}
            onClick={onClick}
            className={className}
            aria-current={ariaCurrent}
        >
            {children}
        </a>
    );
};

/** The tag text and the origin's name in its title, for the origins that get a tag. */
const ORIGIN_TAGS: ReadonlyMap<string, { readonly text: string; readonly name: string }> = new Map([
    ['base', { text: 'base', name: 'base Data Commons' }],
    ['un_system', { text: 'UN', name: 'the UN System Data Commons' }],
]);

/** The tag a DFO term carries among the terms of an outside dataset (TermLink's `home`). */
const DFO_TAG = { text: 'DFO', name: 'the DFO' };

/**
 * The origin tag after a name, from its `declared_by`: "base" for base Data
 * Commons, "UN" for the UN System Data Commons, and nothing for any other
 * origin. The DFO gets "DFO" only when `dfo` is set. Its title reads
 * "Declared by …" for a term and "Data from …" for a `dataset`. A leading
 * space separates it from the name.
 */
export const OriginTag = ({
    declaredBy,
    dataset = false,
    dfo = false,
}: {
    declaredBy: string | null | undefined;
    dataset?: boolean;
    dfo?: boolean;
}) => {
    const tag = dfo && declaredBy === 'dfo' ? DFO_TAG : ORIGIN_TAGS.get(declaredBy ?? '');
    if (tag === undefined) return null;
    return (
        <>
            {' '}
            <span
                className={styles.tag}
                title={`${dataset ? 'Data from' : 'Declared by'} ${tag.name}`}
            >
                {tag.text}
            </span>
        </>
    );
};

/** True when a term of `origin` differs from `home`, a dataset's origin (null for the DFO's). */
const differsFromHome = (origin: string | null, home: 'base' | 'un_system' | null): boolean =>
    origin === 'dfo' ? home !== null : origin !== home;

/**
 * A term or dataset by its label, or by `name` where the caller names it,
 * linking to its view: `?dataset=` for a dataset, `?node=` for anything
 * else, with the origin tag on a term base Data Commons or the UN System
 * Data Commons declares, or whose usage document names it (`termOrigin`).
 * With `home`, the origin of the dataset whose terms the link sits among
 * (null for a DFO dataset), the tag shows only where the term's origin
 * differs from it, and a DFO term among an outside dataset's terms is
 * tagged "DFO".
 */
export const TermLink = ({
    id,
    name,
    className,
    home,
}: {
    id: string;
    name?: string;
    className?: string;
    home?: 'base' | 'un_system' | null;
}) => {
    const model = useModel();
    const origins = useListOrigins(model);
    const view: ExploreView = model.dataset(id) ? { kind: 'dataset', id } : { kind: 'node', id };
    const origin = origins.term(id);
    const tagged = home === undefined || differsFromHome(origin, home);

    return (
        <>
            <ExploreLink view={view} className={className ?? styles.term}>
                {name ?? model.label(id)}
            </ExploreLink>
            {tagged && <OriginTag declaredBy={origin} dfo={home !== undefined} />}
        </>
    );
};
