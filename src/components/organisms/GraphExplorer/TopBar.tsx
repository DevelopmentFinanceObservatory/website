'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useCarried } from './ExploreContext';
import { ExploreLink } from './ExploreLink';
import SearchBox from './SearchBox';
import styles from './TopBar.module.scss';
import { useExplorerData, type Loadable } from './useExplorerData';

import Button from '@/components/atoms/Button/Button';
import Spinner from '@/components/atoms/Spinner/Spinner';
import { carriedHref, START_VIEW, switchBase } from '@/lib/graphExplorer/explore';
import { waitText } from '@/lib/graphExplorer/load';
import {
    CHECK_SHEET_PATH,
    NEW_SHEET_PATH,
    screenOf,
    type GraphExplorerScreen,
} from '@/lib/graphExplorer/paths';
import type { OntologyTerms } from '@/lib/graphExplorer/wire';

const SHEET_LINKS: { screen: GraphExplorerScreen; path: string; label: string }[] = [
    { screen: 'new-sheet', path: NEW_SHEET_PATH, label: 'Start a sheet' },
    { screen: 'check-sheet', path: CHECK_SHEET_PATH, label: 'Check a sheet' },
];

/** Turns the base switch on or off in place, keeping the rest of the URL: the back button skips it. */
const writeBase = (on: boolean) =>
    window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${switchBase(window.location.search, on)}`,
    );

/** The terms list's progress or failure, on a line of its own under the bar. */
const TermsLine = ({
    terms,
    onRetry,
}: {
    terms: Exclude<Loadable<OntologyTerms>, { status: 'ready' }>;
    onRetry: () => void;
}) =>
    terms.status === 'loading' ? (
        <p className={styles.terms} role="status">
            <Spinner size={14} label="Loading" />
            {terms.waiting === null
                ? 'Loading base Data Commons terms.'
                : waitText(terms.waiting.retryInMs, terms.waiting.cause)}
        </p>
    ) : (
        <div className={styles.terms} role="alert">
            <span>{terms.message}</span>
            <Button small onClick={onRetry}>
                Try Again
            </Button>
        </div>
    );

/**
 * The wordmark, the search box, the base Data Commons switch and the three
 * screens, over the section's loaded documents. Every link keeps the carried
 * parameters, and the switch writes the carried `base` parameter.
 */
const TopBar = () => {
    const screen = screenOf(usePathname());
    const carried = useCarried();
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;

    return (
        <header className={styles.bar}>
            <ExploreLink view={START_VIEW} className={styles.wordmark}>
                Graph Explorer
            </ExploreLink>
            <SearchBox model={model} baseTerms={data.baseTerms} />
            <label className={styles.switch}>
                <input
                    type="checkbox"
                    checked={carried.base}
                    onChange={(event) => writeBase(event.target.checked)}
                />
                Search base Data Commons
            </label>
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
            {data.terms !== null && data.terms.status !== 'ready' && (
                <TermsLine terms={data.terms} onRetry={data.retryTerms} />
            )}
        </header>
    );
};

export default TopBar;
