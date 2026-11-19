'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useCarried } from './ExploreContext';
import { ExploreLink } from './ExploreLink';
import SearchBox from './SearchBox';
import styles from './TopBar.module.scss';
import { useExplorerData } from './useExplorerData';

import Button from '@/components/atoms/Button/Button';
import Spinner from '@/components/atoms/Spinner/Spinner';
import {
    carriedHref,
    ORIGIN_SWITCHES,
    START_VIEW,
    switchOrigin,
    type OriginSwitch,
} from '@/lib/graphExplorer/explore';
import { waitText, type Servable } from '@/lib/graphExplorer/load';
import {
    CHECK_SHEET_PATH,
    screenOf,
    SEED_PATH,
    type GraphExplorerScreen,
} from '@/lib/graphExplorer/paths';

const SHEET_LINKS: { screen: GraphExplorerScreen; path: string; label: string }[] = [
    { screen: 'seed', path: SEED_PATH, label: 'Seed a dataset' },
    { screen: 'check-sheet', path: CHECK_SHEET_PATH, label: 'Check a sheet' },
];

/** What each origin switch adds to search, as its checkbox and its terms line name it. */
const ORIGIN_NAMES: Readonly<Record<OriginSwitch, string>> = {
    base: 'base Data Commons',
    un: 'UN System Data Commons',
};

/** Turns one origin switch on or off in place and keeps the rest of the URL. The back button skips it. */
const writeOrigin = (name: OriginSwitch, on: boolean) =>
    window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${switchOrigin(window.location.search, name, on)}`,
    );

const capitalise = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * One terms list's progress, failure, or absence, on a line of its own under
 * the bar. A list this Graph API does not serve says so, with no retry,
 * since asking again gets the same answer.
 */
const TermsLine = ({
    origin,
    terms,
    onRetry,
}: {
    origin: OriginSwitch;
    terms: Exclude<Servable<unknown>, { status: 'ready' }>;
    onRetry: () => void;
}) => {
    if (terms.status === 'notServed') {
        return (
            <p className={styles.terms} role="status">
                {`${capitalise(ORIGIN_NAMES[origin])} terms are not served here.`}
            </p>
        );
    }
    if (terms.status === 'loading') {
        return (
            <p className={styles.terms} role="status">
                <Spinner size={14} label="Loading" />
                <span className={styles.termsText}>
                    {`Loading ${ORIGIN_NAMES[origin]} terms.`}
                    {terms.waiting !== null &&
                        ` ${waitText(terms.waiting.retryInMs, terms.waiting.cause)}`}
                </span>
            </p>
        );
    }
    return (
        <div className={styles.terms} role="alert">
            <span>{terms.message}</span>
            <Button small onClick={onRetry}>
                Try Again
            </Button>
        </div>
    );
};

/**
 * One line for the outside usage documents that failed, however many. The
 * DFO views, and those over any other document that loaded, stand without
 * them.
 */
const UsageLine = ({
    failed,
    onRetry,
}: {
    failed: readonly OriginSwitch[];
    onRetry: () => void;
}) => {
    const names = failed.map((name) => ORIGIN_NAMES[name].replace(/ Data Commons$/, ''));
    return (
        <div className={styles.terms} role="alert">
            <span>
                {`${capitalise(names.join(' and '))} Data Commons usage could not be loaded, so terms leave out ${failed.length === 1 ? 'its' : 'their'} datasets.`}
            </span>
            <Button small onClick={onRetry}>
                Try Again
            </Button>
        </div>
    );
};

/**
 * The wordmark, the search box, the origin switches under "Also search",
 * and the three screens, over the section's loaded documents. Every link
 * keeps the carried parameters, and each switch writes its carried
 * parameter. Each switched-on terms list's progress, failure, or absence
 * shows under the bar, and so does one line for any outside usage document
 * that failed.
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
            <SearchBox model={model} modelStatus={data.model.status} outside={data.outside} />
            <fieldset className={styles.switches}>
                <legend className={styles.legend}>Also search</legend>
                {ORIGIN_SWITCHES.map((name) => (
                    <label key={name} className={styles.switch}>
                        <input
                            type="checkbox"
                            checked={carried[name]}
                            onChange={(event) => writeOrigin(name, event.target.checked)}
                        />
                        {ORIGIN_NAMES[name]}
                    </label>
                ))}
            </fieldset>
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
            {ORIGIN_SWITCHES.map((name) => {
                const terms = data.terms[name];
                if (terms === null || terms.status === 'ready') {
                    return null;
                }
                return (
                    <TermsLine
                        key={name}
                        origin={name}
                        terms={terms}
                        onRetry={() => data.retryTerms(name)}
                    />
                );
            })}
            {data.usageFailed.length > 0 && (
                <UsageLine failed={data.usageFailed} onRetry={data.retryUsage} />
            )}
        </header>
    );
};

export default TopBar;
