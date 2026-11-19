'use client';

import Link from 'next/link';

import { useCarried, useModel, useOptionalExplore } from './ExploreContext';
import styles from './ExploreLink.module.scss';

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

/** The tag text and its title for the origins that get one. */
const originTag = (declaredBy: string | null | undefined) => {
    if (declaredBy === 'base') return { text: 'base', title: 'Declared by base Data Commons' };
    if (declaredBy === 'un_system') {
        return { text: 'UN', title: 'Declared by the UN System Data Commons' };
    }
    return null;
};

/**
 * The origin tag after a term's name, from its `declared_by`: "base" for
 * base Data Commons, "UN" for the UN System Data Commons, and nothing for a
 * DFO term or any other origin. A leading space separates it from the name.
 */
export const OriginTag = ({ declaredBy }: { declaredBy: string | null | undefined }) => {
    const tag = originTag(declaredBy);
    if (tag === null) return null;
    return (
        <>
            {' '}
            <span className={styles.tag} title={tag.title}>
                {tag.text}
            </span>
        </>
    );
};

/**
 * A term or dataset by its label, or by `name` where the caller names it,
 * linking to its view: `?dataset=` for a dataset, `?node=` for anything
 * else, with the origin tag on a term base Data Commons or the UN System
 * Data Commons declares.
 */
export const TermLink = ({
    id,
    name,
    className,
}: {
    id: string;
    name?: string;
    className?: string;
}) => {
    const model = useModel();
    const view: ExploreView = model.dataset(id) ? { kind: 'dataset', id } : { kind: 'node', id };

    return (
        <>
            <ExploreLink view={view} className={className ?? styles.term}>
                {name ?? model.label(id)}
            </ExploreLink>
            <OriginTag declaredBy={model.node(id)?.declared_by} />
        </>
    );
};
