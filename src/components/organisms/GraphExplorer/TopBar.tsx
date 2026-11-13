'use client';

import Link from 'next/link';

import { useCarried } from './ExploreContext';
import { ExploreLink } from './ExploreLink';
import SearchBox from './SearchBox';
import styles from './TopBar.module.scss';

import { carriedHref, START_VIEW } from '@/lib/graphExplorer/explore';
import type { Model } from '@/lib/graphExplorer/model';
import { CHECK_SHEET_PATH, NEW_SHEET_PATH } from '@/lib/graphExplorer/paths';
import type { OntologyTerms } from '@/lib/graphExplorer/wire';

export type GraphExplorerScreen = 'explore' | 'new-sheet' | 'check-sheet';

type TopBarProps = {
    /** The screen on show, marked in the links. */
    screen: GraphExplorerScreen;
    model: Model | null;
    baseTerms?: OntologyTerms;
};

const SHEET_LINKS: { screen: GraphExplorerScreen; path: string; label: string }[] = [
    { screen: 'new-sheet', path: NEW_SHEET_PATH, label: 'Start a sheet' },
    { screen: 'check-sheet', path: CHECK_SHEET_PATH, label: 'Check a sheet' },
];

/** The wordmark, the search box and the three screens; every link keeps the carried parameters. */
const TopBar = ({ screen, model, baseTerms }: TopBarProps) => {
    const carried = useCarried();
    return (
        <header className={styles.bar}>
            <ExploreLink view={START_VIEW} className={styles.wordmark}>
                Graph Explorer
            </ExploreLink>
            <SearchBox model={model} baseTerms={baseTerms} />
            <nav className={styles.links} aria-label="Screens">
                <ExploreLink
                    view={START_VIEW}
                    className={styles.link}
                    current={screen === 'explore'}
                >
                    Explore
                </ExploreLink>
                {SHEET_LINKS.map((link) => (
                    <Link
                        key={link.screen}
                        href={carriedHref(link.path, carried)}
                        prefetch={false}
                        className={styles.link}
                        aria-current={screen === link.screen ? 'page' : undefined}
                    >
                        {link.label}
                    </Link>
                ))}
            </nav>
        </header>
    );
};

export default TopBar;
