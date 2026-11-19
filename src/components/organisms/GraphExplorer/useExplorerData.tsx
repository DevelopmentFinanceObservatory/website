'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useCarried } from './ExploreContext';

import { ORIGIN_SWITCHES, type OriginSwitch } from '@/lib/graphExplorer/explore';
import {
    LOADING,
    loadDocument,
    loadFailure,
    loadServed,
    settled,
    sharedLoad,
    type Loadable,
    type Servable,
    type SharedLoad,
    type WaitCause,
} from '@/lib/graphExplorer/load';
import { buildModel, type Model } from '@/lib/graphExplorer/model';
import {
    outsideTermList,
    readSchema,
    readTerms,
    readUnTerms,
    readUsage,
    type SchemaTerm,
    type SchemaTerms,
} from '@/lib/graphExplorer/wire';

const SCHEMA_URL = '/api/graph/schema';
const USAGE_URL = '/api/graph/schema/usage';
const TERMS_URL = '/api/graph/schema/terms';
const UN_TERMS_URL = '/api/graph/schema/terms/un_system';
const BASE_TERMS = 'Base Data Commons terms';
const UN_TERMS = 'UN System Data Commons terms';

/** Each terms list's state by the switch that loads it. It is null until first asked for. */
export type TermsStates = Readonly<Record<OriginSwitch, Servable<SchemaTerms> | null>>;

type LoadedDocuments = {
    readonly model: Loadable<Model>;
    readonly retryModel: () => void;
    readonly terms: TermsStates;
    /** Loads one terms list unless it is loading or loaded; `retry` also reloads a failed one. */
    readonly loadTerms: (origin: OriginSwitch, retry?: boolean) => void;
    /**
     * The merged outside list for a pair of switches, built once for each pair
     * whenever a list loads, so every screen shares one list and a wait tick
     * leaves it as it is.
     */
    readonly outsideOf: (
        switches: Readonly<Record<OriginSwitch, boolean>>,
    ) => readonly SchemaTerm[];
};

const loaded = (state: Servable<SchemaTerms> | null): SchemaTerms | undefined =>
    state?.status === 'ready' ? state.value : undefined;

/** Whether a terms list has yet to load or is loading, as opposed to loaded, failed or not served. */
const inFlight = (state: Servable<SchemaTerms> | null): boolean =>
    state === null || state.status === 'loading';

const DocumentsContext = createContext<LoadedDocuments | null>(null);

/**
 * The schema and usage documents, built into one model, and one terms list
 * per origin switch, each loaded on its own so one failing leaves the other
 * in place. The UN System list reads as not served on a 404 whose cause is
 * `origin_not_served`. It sits in
 * the section's layout, which stays mounted while the reader moves between
 * Explore, Seed a dataset and Check a sheet, so each document loads once per
 * visit.
 */
export const ExplorerDataProvider = ({ children }: { children: React.ReactNode }) => {
    const [model, setModel] = useState<Loadable<Model>>(LOADING);
    const [attempt, setAttempt] = useState(0);
    const [baseTerms, setBaseTerms] = useState<Servable<SchemaTerms> | null>(null);
    const [unTerms, setUnTerms] = useState<Servable<SchemaTerms> | null>(null);
    const [loads] = useState<Readonly<Record<OriginSwitch, SharedLoad>>>(() => ({
        base: sharedLoad({
            what: BASE_TERMS,
            load: (options) => loadDocument(BASE_TERMS, TERMS_URL, readTerms, options),
            publish: setBaseTerms,
        }),
        un: sharedLoad({
            what: UN_TERMS,
            load: (options) => loadServed(UN_TERMS, UN_TERMS_URL, readUnTerms, options),
            publish: setUnTerms,
        }),
    }));

    useEffect(() => {
        const controller = new AbortController();
        const options = {
            signal: controller.signal,
            onWait: (retryInMs: number, cause: WaitCause) => {
                if (!controller.signal.aborted) {
                    setModel({ status: 'loading', waiting: { retryInMs, cause } });
                }
            },
        };

        (async () => {
            try {
                const [schema, usage] = await Promise.all([
                    loadDocument('The model', SCHEMA_URL, readSchema, options),
                    loadDocument('The datasets document', USAGE_URL, readUsage, options),
                ]);
                setModel({ status: 'ready', value: buildModel(schema, usage) });
            } catch (error) {
                if (controller.signal.aborted) return;
                controller.abort();
                setModel(loadFailure(error, 'The model'));
            }
        })();

        return () => controller.abort();
    }, [attempt]);

    // An abort forgets a load still running, so StrictMode's second mount starts it again.
    useEffect(
        () => () => {
            for (const name of ORIGIN_SWITCHES) loads[name].abort();
        },
        [loads],
    );

    const loadTerms = useCallback(
        (origin: OriginSwitch, retry?: boolean) => loads[origin].start(retry),
        [loads],
    );

    const retryModel = useCallback(() => {
        setModel(LOADING);
        setAttempt((n) => n + 1);
    }, []);

    // Keyed on the loaded lists and the base list's progress, which a wait tick leaves unchanged.
    const baseValue = loaded(baseTerms);
    const unValue = loaded(unTerms);
    const baseInFlight = inFlight(baseTerms);
    const outsideOf = useMemo(() => {
        const merge = (base: boolean, un: boolean) =>
            outsideTermList({
                base: base ? baseValue : undefined,
                un: un ? unValue : undefined,
                baseLoading: base && baseInFlight,
            });
        const lists = {
            none: merge(false, false),
            base: merge(true, false),
            un: merge(false, true),
            both: merge(true, true),
        };
        return ({ base, un }: Readonly<Record<OriginSwitch, boolean>>) =>
            base ? (un ? lists.both : lists.base) : un ? lists.un : lists.none;
    }, [baseValue, unValue, baseInFlight]);

    return (
        <DocumentsContext.Provider
            value={{
                model,
                retryModel,
                terms: { base: baseTerms, un: unTerms },
                loadTerms,
                outsideOf,
            }}
        >
            {children}
        </DocumentsContext.Provider>
    );
};

export type ExplorerData = {
    readonly model: Loadable<Model>;
    readonly retryModel: () => void;
    /** Which terms lists search reaches, set by the URL's `base` and `un` parameters. */
    readonly switches: Readonly<Record<OriginSwitch, boolean>>;
    /** Each terms list's state while its switch is on; null while it is off. */
    readonly terms: TermsStates;
    /** Whether each terms list has come to rest, by loading or by not being served. False while its switch is off. */
    readonly termsSettled: Readonly<Record<OriginSwitch, boolean>>;
    /**
     * The terms lists loaded while their switches are on, merged by
     * `outsideTermList`, for search and the centre. One list per pair of
     * switches and per load, shared by every screen.
     */
    readonly outside: readonly SchemaTerm[];
    readonly retryTerms: (origin: OriginSwitch) => void;
};

/**
 * The loaded documents for one screen, with each terms list loaded whenever
 * the URL turns its switch on. Only under ExplorerDataProvider.
 */
export const useExplorerData = (): ExplorerData => {
    const documents = useContext(DocumentsContext);
    if (!documents) throw new Error('useExplorerData is used outside ExplorerDataProvider');
    const { base, un } = useCarried();
    const { model, retryModel, terms, loadTerms, outsideOf } = documents;

    useEffect(() => {
        if (base) loadTerms('base');
    }, [base, loadTerms]);
    useEffect(() => {
        if (un) loadTerms('un');
    }, [un, loadTerms]);

    const shown: TermsStates = { base: base ? terms.base : null, un: un ? terms.un : null };
    return {
        model,
        retryModel,
        switches: { base, un },
        terms: shown,
        termsSettled: { base: settled(shown.base), un: settled(shown.un) },
        outside: outsideOf({ base, un }),
        retryTerms: (origin) => loadTerms(origin, true),
    };
};
