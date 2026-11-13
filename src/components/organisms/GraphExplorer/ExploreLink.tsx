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
 * follows the href; a plain anchor keeps Next from prefetching the dynamic
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

/** The "base" tag on a term base Data Commons declares. */
export const BaseTag = () => (
    <span className={styles.tag} title="Declared by base Data Commons">
        base
    </span>
);

/**
 * A term or dataset by its label, linking to its view: `?dataset=` for a
 * dataset, `?node=` for anything else, with the "base" tag on a base term.
 */
export const TermLink = ({ id, className }: { id: string; className?: string }) => {
    const model = useModel();
    const view: ExploreView = model.dataset(id) ? { kind: 'dataset', id } : { kind: 'node', id };

    return (
        <>
            <ExploreLink view={view} className={className ?? styles.term}>
                {model.label(id)}
            </ExploreLink>
            {model.isBase(id) && (
                <>
                    {' '}
                    <BaseTag />
                </>
            )}
        </>
    );
};
