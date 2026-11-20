'use client';

import classNames from 'classnames';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';

import { BreakableId } from './BreakableId';
import { useCarried, useOptionalExplore } from './ExploreContext';
import { OriginTag } from './ExploreLink';
import styles from './SearchBox.module.scss';
import { useGraphSearch, type GraphSearchState } from './useGraphSearch';

import { exploreHref, type ExploreView, type OriginSwitch } from '@/lib/graphExplorer/explore';
import { describeGraphHit, newGraphHits, unavailableLine } from '@/lib/graphExplorer/graphSearch';
import { declarerPlace, KIND_WORDS, kindWords, type Model } from '@/lib/graphExplorer/model';
import {
    enterChoice,
    escapeAction,
    search,
    searchPlaceholder,
    stepActive,
    type SearchHit,
} from '@/lib/graphExplorer/search';
import type { GraphSearchHit, SchemaTerm } from '@/lib/graphExplorer/wire';

/**
 * What a hit is, in a few words: its kind, the list a value sits in, the
 * types of a value no list holds, or the Data Commons outside the model
 * that holds it.
 */
const describe = (model: Model, hit: SearchHit): string => {
    if (!hit.inModel) {
        return `${KIND_WORDS[hit.kind]} ${declarerPlace(hit.declaredBy)}, outside the DFO model`;
    }
    if (hit.kind === 'value') {
        const list = model.valueListOf(hit.id);
        if (list !== undefined) return `Value in ${model.label(list)}`;
    }
    return kindWords(model, hit.kind, model.node(hit.id)?.types ?? []);
};

type SearchBoxProps = {
    /** Null while the model loads or after it failed, when the box is disabled. */
    model: Model | null;
    /** Whether the model is loading or failed to load, for the disabled box's placeholder. */
    modelStatus: 'loading' | 'ready' | 'failed';
    /** The terms lists whose switches are on and that have loaded. */
    outside?: readonly SchemaTerm[];
    /** The origin switches, which the graph search follows. */
    switches: Readonly<Record<OriginSwitch, boolean>>;
};

/** A row of the results: one of the model's hits, or a node only the graph search found. */
type Option =
    | { readonly from: 'model'; readonly hit: SearchHit }
    | { readonly from: 'graph'; readonly hit: GraphSearchHit };

/** The note under the results, or null when none is needed. */
const resultNote = (
    total: number,
    shown: number,
    graph: GraphSearchState,
    graphShown: number,
): string | null => {
    if (graph.status === 'loading') return 'Searching the graph…';
    if (graph.status === 'failed') return 'The graph search did not answer.';
    const missing = graph.status === 'ready' ? unavailableLine(graph.value.unavailable) : null;
    if (total === 0 && graphShown === 0) {
        const nothing =
            graph.status === 'ready'
                ? 'Nothing matches. Paste a whole dcid, or describe what a StatVar measures.'
                : 'Nothing matches.';
        return missing ? `${nothing} ${missing}` : nothing;
    }
    if (total > shown) {
        const first = `The first ${shown} of ${total.toLocaleString('en-GB')} in the model. Type more to narrow.`;
        return missing ? `${first} ${missing}` : first;
    }
    return missing;
};

/**
 * The top bar's search: the model's results as the reader types, DFO terms
 * first, then, once typing pauses, the nodes the graph search finds that the
 * model's results do not list. Every row is reachable by keyboard (arrows
 * move, Enter opens, Escape closes, then clears). Choosing a dataset opens
 * `?dataset=`, anything else `?node=`.
 */
const SearchBox = ({ model, modelStatus, outside, switches }: SearchBoxProps) => {
    const navigation = useOptionalExplore();
    const carried = useCarried();
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    // Set when the arrow keys move the active result, so only they scroll the list.
    const stepped = useRef(false);
    const id = useId();
    const listId = `${id}-results`;

    const result = useMemo(
        () => (model ? search(model, query, { outside }) : { hits: [], total: 0 }),
        [model, query, outside],
    );
    const graph = useGraphSearch(model ? query : '', switches);
    const graphHits = graph.status === 'ready' ? newGraphHits(graph.value.hits, result.hits) : [];
    const options: readonly Option[] = [
        ...result.hits.map((hit): Option => ({ from: 'model', hit })),
        ...graphHits.map((hit): Option => ({ from: 'graph', hit })),
    ];
    const shown = open && query.trim() !== '' && model !== null;

    const choose = (option: Option) => {
        setQuery('');
        setOpen(false);
        setActive(-1);
        const view: ExploreView =
            option.from === 'graph'
                ? { kind: 'node', id: option.hit.ref }
                : option.hit.kind === 'dataset'
                  ? { kind: 'dataset', id: option.hit.id }
                  : { kind: 'node', id: option.hit.id };
        if (navigation) navigation.go(view);
        else router.push(exploreHref({ view, ...carried }));
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const count = options.length;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            if (count === 0) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            stepped.current = true;
            setActive((current) => stepActive(current, step, count));
            return;
        }
        if (event.key === 'Enter') {
            const chosen = enterChoice(active, count, shown);
            const option = chosen === null ? undefined : options[chosen];
            if (option) {
                event.preventDefault();
                choose(option);
            }
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            if (escapeAction(shown) === 'close') setOpen(false);
            else setQuery('');
            setActive(-1);
        }
    };

    const activeOption = shown ? options[active] : undefined;

    // The results box scrolls, so a result reached by the arrow keys is scrolled into it.
    useEffect(() => {
        if (!stepped.current) return;
        stepped.current = false;
        if (active >= 0)
            document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
    }, [active, id]);

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
                aria-activedescendant={activeOption ? `${id}-${active}` : undefined}
                placeholder={searchPlaceholder(model ? 'ready' : modelStatus)}
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
                        options.map((option, index) => {
                            const graphRow = option.from === 'graph';
                            const key = graphRow
                                ? `graph:${option.hit.ref}`
                                : `${option.hit.kind}:${option.hit.id}`;
                            const dcid = graphRow ? option.hit.ref : option.hit.id;
                            return (
                                <Fragment key={key}>
                                    {index === result.hits.length && (
                                        <li role="presentation" className={styles.group}>
                                            From the graph
                                        </li>
                                    )}
                                    <li
                                        id={`${id}-${index}`}
                                        role="option"
                                        aria-selected={index === active}
                                        className={classNames(
                                            styles.option,
                                            index === active && styles.optionActive,
                                        )}
                                        // Keeps focus in the box so the blur does not close the list first.
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => choose(option)}
                                        onMouseMove={() => setActive(index)}
                                    >
                                        <span className={styles.name}>
                                            {graphRow
                                                ? (option.hit.label ?? option.hit.ref)
                                                : option.hit.label}
                                            <OriginTag
                                                declaredBy={
                                                    graphRow
                                                        ? option.hit.declared_by
                                                        : option.hit.declaredBy
                                                }
                                            />
                                        </span>
                                        <span className={styles.meta}>
                                            {graphRow
                                                ? describeGraphHit(model, option.hit)
                                                : describe(model, option.hit)}
                                            <span className={styles.dcid}>
                                                <BreakableId text={dcid} />
                                            </span>
                                        </span>
                                    </li>
                                </Fragment>
                            );
                        })}
                </ul>
                <p className={styles.note} aria-live="polite">
                    {resultNote(result.total, result.hits.length, graph, graphHits.length)}
                </p>
            </div>
        </div>
    );
};

export default SearchBox;
