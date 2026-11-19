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

/** Each terms list's state by the switch that loads it. It is null until first asked for. */
export type TermsStates = Readonly<Record<OriginSwitch, Servable<SchemaTerms> | null>>;

type LoadedDocuments = {
    readonly model: Loadable<Model>;
    readonly retryModel: () => void;
    readonly terms: TermsStates;
    /** Loads one terms list unless it is loading or loaded; `retry` also reloads a failed one. */
    readonly loadTerms: (origin: OriginSwitch, retry?: boolean) => void;
};

const DocumentsContext = createContext<LoadedDocuments | null>(null);

/**
 * The schema and usage documents, built into one model, and one terms list
 * per origin switch, each loaded on its own so one failing leaves the other
 * in place. The UN System list reads as not served on any 404. It sits in
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
            load: (options) =>
                loadDocument('Base Data Commons terms', TERMS_URL, readTerms, options),
            publish: setBaseTerms,
        }),
        un: sharedLoad({
            load: (options) =>
                loadServed('UN System Data Commons terms', UN_TERMS_URL, readUnTerms, options),
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
                setModel(loadFailure(error));
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

    return (
        <DocumentsContext.Provider
            value={{ model, retryModel, terms: { base: baseTerms, un: unTerms }, loadTerms }}
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
    /** The terms lists loaded while their switches are on, merged once per load, for search and the centre. */
    readonly outside: readonly SchemaTerm[];
    readonly retryTerms: (origin: OriginSwitch) => void;
};

const loaded = (state: Servable<SchemaTerms> | null): SchemaTerms | undefined =>
    state?.status === 'ready' ? state.value : undefined;

/**
 * The loaded documents for one screen, with each terms list loaded whenever
 * the URL turns its switch on. Only under ExplorerDataProvider.
 */
export const useExplorerData = (): ExplorerData => {
    const documents = useContext(DocumentsContext);
    if (!documents) throw new Error('useExplorerData is used outside ExplorerDataProvider');
    const { base, un } = useCarried();
    const { model, retryModel, terms, loadTerms } = documents;

    useEffect(() => {
        if (base) loadTerms('base');
    }, [base, loadTerms]);
    useEffect(() => {
        if (un) loadTerms('un');
    }, [un, loadTerms]);

    const shown: TermsStates = { base: base ? terms.base : null, un: un ? terms.un : null };
    // Search and the centre heading memoise on `outside`, so it keeps its identity between renders.
    const outside = useMemo(
        () =>
            outsideTermList({
                base: base ? loaded(terms.base) : undefined,
                un: un ? loaded(terms.un) : undefined,
            }),
        [base, un, terms.base, terms.un],
    );
    return {
        model,
        retryModel,
        switches: { base, un },
        terms: shown,
        termsSettled: { base: settled(shown.base), un: settled(shown.un) },
        outside,
        retryTerms: (origin) => loadTerms(origin, true),
    };
};
