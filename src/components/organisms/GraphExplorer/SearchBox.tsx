'use client';

import classNames from 'classnames';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';

import { useCarried, useOptionalExplore } from './ExploreContext';
import { BaseTag } from './ExploreLink';
import styles from './SearchBox.module.scss';

import { exploreHref, type ExploreView } from '@/lib/graphExplorer/explore';
import { KIND_WORDS, type Model } from '@/lib/graphExplorer/model';
import { search, stepActive, type SearchHit } from '@/lib/graphExplorer/search';
import type { OntologyTerms } from '@/lib/graphExplorer/wire';

/** What a hit is, in a few words: its kind, the list a value sits in, or that it is outside the model. */
const describe = (model: Model, hit: SearchHit): string => {
    if (!hit.inModel) return `${KIND_WORDS[hit.kind]} in base Data Commons, outside the DFO model`;
    if (hit.kind === 'value') {
        const list = model.valueListOf(hit.id);
        if (list !== undefined) return `Value in ${model.label(list)}`;
    }
    return KIND_WORDS[hit.kind];
};

type SearchBoxProps = {
    /** Null while the model loads; the box is disabled until then. */
    model: Model | null;
    /** The terms list when the base Data Commons switch is on and it has loaded. */
    baseTerms?: OntologyTerms;
};

/**
 * The top bar's search: results as the reader types, instance terms first,
 * reachable by keyboard (arrows move, Enter opens, Escape closes, then
 * clears). Choosing a dataset opens `?dataset=`, anything else `?node=`.
 */
const SearchBox = ({ model, baseTerms }: SearchBoxProps) => {
    const navigation = useOptionalExplore();
    const carried = useCarried();
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const id = useId();
    const listId = `${id}-results`;

    const result = useMemo(
        () => (model ? search(model, query, { baseTerms }) : { hits: [], total: 0 }),
        [model, query, baseTerms],
    );
    const shown = open && query.trim() !== '' && model !== null;

    const choose = (hit: SearchHit) => {
        setQuery('');
        setOpen(false);
        setActive(-1);
        const view: ExploreView =
            hit.kind === 'dataset' ? { kind: 'dataset', id: hit.id } : { kind: 'node', id: hit.id };
        if (navigation) navigation.go(view);
        else router.push(exploreHref({ view, ...carried }));
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const count = result.hits.length;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            if (count === 0) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((current) => stepActive(current, step, count));
            return;
        }
        if (event.key === 'Enter') {
            const hit = result.hits[active] ?? result.hits[0];
            if (shown && hit) {
                event.preventDefault();
                choose(hit);
            }
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            if (shown) setOpen(false);
            else setQuery('');
            setActive(-1);
        }
    };

    const activeHit = shown ? result.hits[active] : undefined;

    return (
        <div className={styles.search}>
            <input
                type="search"
                className={styles.input}
                role="combobox"
                aria-label="Search names, codes and dcids"
                aria-autocomplete="list"
                aria-expanded={shown}
                aria-controls={listId}
                aria-activedescendant={activeHit ? `${id}-${active}` : undefined}
                placeholder={model ? 'Search names, codes and dcids' : 'Loading the model'}
                autoComplete="off"
                spellCheck={false}
                disabled={!model}
                value={query}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setOpen(true);
                    setActive(-1);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={onKeyDown}
            />
            <div className={styles.results} hidden={!shown}>
                <ul id={listId} role="listbox" aria-label="Search results" className={styles.list}>
                    {model &&
                        result.hits.map((hit, index) => (
                            <li
                                key={`${hit.kind}:${hit.id}`}
                                id={`${id}-${index}`}
                                role="option"
                                aria-selected={index === active}
                                className={classNames(
                                    styles.option,
                                    index === active && styles.optionActive,
                                )}
                                // Keeps focus in the box so the blur does not close the list first.
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => choose(hit)}
                                onMouseMove={() => setActive(index)}
                            >
                                <span className={styles.name}>
                                    {hit.label}
                                    {hit.base && (
                                        <>
                                            {' '}
                                            <BaseTag />
                                        </>
                                    )}
                                </span>
                                <span className={styles.meta}>
                                    {describe(model, hit)}
                                    <span className={styles.dcid}>{hit.id}</span>
                                </span>
                            </li>
                        ))}
                </ul>
                <p className={styles.note} aria-live="polite">
                    {result.total === 0
                        ? 'Nothing matches.'
                        : result.total > result.hits.length
                          ? `The first ${result.hits.length} of ${result.total.toLocaleString('en-GB')}. Type more to narrow.`
                          : null}
                </p>
            </div>
        </div>
    );
};

export default SearchBox;
