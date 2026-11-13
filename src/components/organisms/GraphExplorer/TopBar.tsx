'use client';

import Link from 'next/link';

import { ExploreLink } from './ExploreLink';
import SearchBox from './SearchBox';
import styles from './TopBar.module.scss';

import { EXPLORE_PATH, START_VIEW } from '@/lib/graphExplorer/explore';
import type { Model } from '@/lib/graphExplorer/model';
import type { OntologyTerms } from '@/lib/graphExplorer/wire';

export type GraphExplorerScreen = 'explore' | 'new-sheet' | 'check-sheet';

type TopBarProps = {
    /** The screen on show, marked in the links. */
    screen: GraphExplorerScreen;
    model: Model | null;
    baseTerms?: OntologyTerms;
};

const SHEET_LINKS: { screen: GraphExplorerScreen; href: string; label: string }[] = [
    { screen: 'new-sheet', href: `${EXPLORE_PATH}/new-sheet`, label: 'Start a sheet' },
    { screen: 'check-sheet', href: `${EXPLORE_PATH}/check-sheet`, label: 'Check a sheet' },
];

/** The wordmark, the search box and the three screens. */
const TopBar = ({ screen, model, baseTerms }: TopBarProps) => (
    <header className={styles.bar}>
        <ExploreLink view={START_VIEW} className={styles.wordmark}>
            Graph Explorer
        </ExploreLink>
        <SearchBox model={model} baseTerms={baseTerms} />
        <nav className={styles.links} aria-label="Screens">
            <ExploreLink view={START_VIEW} className={styles.link} current={screen === 'explore'}>
                Explore
            </ExploreLink>
            {SHEET_LINKS.map((link) => (
                <Link
                    key={link.screen}
                    href={link.href}
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

export default TopBar;
