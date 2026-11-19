'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useCarried } from './ExploreContext';

import { ORIGIN_SWITCHES, type OriginSwitch } from '@/lib/graphExplorer/explore';
import {
    keyedLoads,
    LOADING,
    loadDocument,
    loadFailure,
    loadNodeView,
    loadServed,
    nodeViewName,
    sharedLoad,
    type KeyedLoads,
    type Loadable,
    type NodeViewState,
    type Refusal,
    type Servable,
    type SharedLoad,
    type WaitCause,
} from '@/lib/graphExplorer/load';
import { buildModels, type ExploreModels, type Model } from '@/lib/graphExplorer/model';
import type { NodeViewFailure } from '@/lib/graphExplorer/nodeView';
import {
    outsideTermList,
    readSchema,
    readTerms,
    readUnTerms,
    readUsage,
    type SchemaDocument,
    type SchemaNodeView,
    type SchemaTerm,
    type SchemaTerms,
    type SchemaUsage,
} from '@/lib/graphExplorer/wire';

const SCHEMA_URL = '/api/graph/schema';
const USAGE_URL = '/api/graph/schema/usage';
const BASE_USAGE_URL = '/api/graph/schema/usage/base';
const UN_USAGE_URL = '/api/graph/schema/usage/un_system';
const TERMS_URL = '/api/graph/schema/terms';
const UN_TERMS_URL = '/api/graph/schema/terms/un_system';
const BASE_USAGE = 'Base Data Commons usage';
const UN_USAGE = 'UN System Data Commons usage';
const BASE_TERMS = 'Base Data Commons terms';
const UN_TERMS = 'UN System Data Commons terms';

/** Each terms list's state by the switch that loads it. It is null until first asked for. */
export type TermsStates = Readonly<Record<OriginSwitch, Servable<SchemaTerms> | null>>;

/** Each outside usage document's state by the origin it describes. It is null until its load starts. */
export type UsageStates = Readonly<Record<OriginSwitch, Servable<SchemaUsage> | null>>;

/** The schema and DFO usage documents, which every model is built over. */
type DfoDocuments = { readonly schema: SchemaDocument; readonly usage: SchemaUsage };

/** The documents the models are built from: the DFO pair and each outside usage document landed. */
type ModelDocuments = DfoDocuments & {
    readonly base: SchemaUsage | undefined;
    readonly un: SchemaUsage | undefined;
};

type LoadedDocuments = {
    readonly dfo: Loadable<DfoDocuments>;
    /** Null until the DFO pair lands. A new object follows each later arrival of an outside document. */
    readonly documents: ModelDocuments | null;
    readonly retryModel: () => void;
    readonly usage: UsageStates;
    /** Loads each outside usage document again that failed. */
    readonly retryUsage: () => void;
    readonly terms: TermsStates;
    /** Loads one terms list unless it is loading or loaded; `retry` also reloads a failed one. */
    readonly loadTerms: (origin: OriginSwitch, retry?: boolean) => void;
};

type NodeViewStates = {
    /** Each node view's state by dcid, for the dcids held or loaded this visit. */
    readonly states: ReadonlyMap<string, NodeViewState>;
    /** Each node view's last failure by dcid, kept while a retry loads it. */
    readonly failures: ReadonlyMap<string, NodeViewFailure>;
};

type NodeViews = NodeViewStates & { readonly loads: KeyedLoads };

/** The node views' states once `state` is published for `dcid`. */
const publishView = (
    { states, failures }: NodeViewStates,
    dcid: string,
    state: NodeViewState | null,
): NodeViewStates => {
    const nextStates = new Map(states);
    if (state === null) nextStates.delete(dcid);
    else nextStates.set(dcid, state);
    const nextFailures = new Map(failures);
    if (state?.status === 'failed') nextFailures.set(dcid, state);
    else if (state?.status !== 'loading') nextFailures.delete(dcid);
    return { states: nextStates, failures: nextFailures };
};

/** Whether a terms list has yet to load or is loading, as opposed to loaded, failed or not served. */
const inFlight = (state: Servable<SchemaTerms> | null): boolean =>
    state === null || state.status === 'loading';

const DocumentsContext = createContext<LoadedDocuments | null>(null);
const NodeViewsContext = createContext<NodeViews | null>(null);

const loaded = <TValue,>(state: Servable<TValue> | null): TValue | undefined =>
    state?.status === 'ready' ? state.value : undefined;

/**
 * The schema and usage documents the models are built from, one terms list
 * per origin switch, and the node views centred terms ask for, each loaded
 * on its own so one failing leaves the others in place. Both outside usage
 * documents load at once, beside the DFO pair: the models build when the
 * DFO pair lands and rebuild as each outside document arrives, so a failed
 * or slow outside document holds back nothing. The outside usage documents
 * and the UN System terms list read as not served on a 404 whose cause is
 * `origin_not_served`. It sits in the section's layout, which stays mounted
 * while the reader moves between Explore, Seed a dataset and Check a sheet,
 * so each document and node view loads once per visit.
 */
export const ExplorerDataProvider = ({ children }: { children: React.ReactNode }) => {
    const [dfo, setDfo] = useState<Loadable<DfoDocuments>>(LOADING);
    const [attempt, setAttempt] = useState(0);
    const [baseUsage, setBaseUsage] = useState<Servable<SchemaUsage> | null>(null);
    const [unUsage, setUnUsage] = useState<Servable<SchemaUsage> | null>(null);
    const [baseTerms, setBaseTerms] = useState<Servable<SchemaTerms> | null>(null);
    const [unTerms, setUnTerms] = useState<Servable<SchemaTerms> | null>(null);
    const [nodeViews, setNodeViews] = useState<NodeViewStates>(() => ({
        states: new Map(),
        failures: new Map(),
    }));
    const [usageLoads] = useState<Readonly<Record<OriginSwitch, SharedLoad>>>(() => ({
        base: sharedLoad<SchemaUsage>({
            what: BASE_USAGE,
            load: (options) => loadServed(BASE_USAGE, BASE_USAGE_URL, readUsage, options),
            publish: setBaseUsage,
        }),
        un: sharedLoad<SchemaUsage>({
            what: UN_USAGE,
            load: (options) => loadServed(UN_USAGE, UN_USAGE_URL, readUsage, options),
            publish: setUnUsage,
        }),
    }));
    const [termsLoads] = useState<Readonly<Record<OriginSwitch, SharedLoad>>>(() => ({
        base: sharedLoad<SchemaTerms>({
            what: BASE_TERMS,
            load: (options) => loadDocument(BASE_TERMS, TERMS_URL, readTerms, options),
            publish: setBaseTerms,
        }),
        un: sharedLoad<SchemaTerms>({
            what: UN_TERMS,
            load: (options) => loadServed(UN_TERMS, UN_TERMS_URL, readUnTerms, options),
            publish: setUnTerms,
        }),
    }));
    const [nodeViewLoads] = useState(() =>
        keyedLoads<SchemaNodeView, Refusal>({
            what: nodeViewName,
            load: loadNodeView,
            publish: (dcid, state) => setNodeViews((views) => publishView(views, dcid, state)),
        }),
    );

    useEffect(() => {
        const controller = new AbortController();
        const options = {
            signal: controller.signal,
            onWait: (retryInMs: number, cause: WaitCause) => {
                if (!controller.signal.aborted) {
                    setDfo({ status: 'loading', waiting: { retryInMs, cause } });
                }
            },
        };

        (async () => {
            try {
                const [schema, usage] = await Promise.all([
                    loadDocument('The model', SCHEMA_URL, readSchema, options),
                    loadDocument('The datasets document', USAGE_URL, readUsage, options),
                ]);
                setDfo({ status: 'ready', value: { schema, usage } });
            } catch (error) {
                if (controller.signal.aborted) return;
                controller.abort();
                setDfo(loadFailure(error, 'The model'));
            }
        })();

        return () => controller.abort();
    }, [attempt]);

    // An abort forgets a load still running, so StrictMode's second mount starts it again.
    useEffect(() => {
        for (const name of ORIGIN_SWITCHES) usageLoads[name].start();
        return () => {
            for (const name of ORIGIN_SWITCHES) usageLoads[name].abort();
        };
    }, [usageLoads]);
    useEffect(
        () => () => {
            for (const name of ORIGIN_SWITCHES) termsLoads[name].abort();
        },
        [termsLoads],
    );

    const loadTerms = useCallback(
        (origin: OriginSwitch, retry?: boolean) => termsLoads[origin].start(retry),
        [termsLoads],
    );

    const retryModel = useCallback(() => {
        setDfo(LOADING);
        setAttempt((n) => n + 1);
    }, []);

    const retryUsage = useCallback(() => {
        for (const name of ORIGIN_SWITCHES) usageLoads[name].start(true);
    }, [usageLoads]);

    const dfoDocuments = dfo.status === 'ready' ? dfo.value : null;
    const base = loaded(baseUsage);
    const un = loaded(unUsage);
    const documents = useMemo(
        () => (dfoDocuments === null ? null : { ...dfoDocuments, base, un }),
        [dfoDocuments, base, un],
    );

    const views = useMemo(
        () => ({ ...nodeViews, loads: nodeViewLoads }),
        [nodeViews, nodeViewLoads],
    );

    return (
        <DocumentsContext.Provider
            value={{
                dfo,
                documents,
                retryModel,
                usage: { base: baseUsage, un: unUsage },
                retryUsage,
                terms: { base: baseTerms, un: unTerms },
                loadTerms,
            }}
        >
            <NodeViewsContext.Provider value={views}>{children}</NodeViewsContext.Provider>
        </DocumentsContext.Provider>
    );
};

/** Stands in for a terms list not loaded, as a key of mergedTerms. */
const NO_TERMS = {};

const mergedLists = new WeakMap<object, WeakMap<object, readonly SchemaTerm[]>>();

/**
 * The loaded terms lists merged by outsideTermList, once per pair of lists.
 * While the base list loads, outsideTermList holds the UN rows back, so the
 * pair is kept as the one with neither list loaded.
 */
const mergedTerms = (
    base: SchemaTerms | undefined,
    un: SchemaTerms | undefined,
    baseLoading: boolean,
) => {
    let byUn = mergedLists.get(base ?? NO_TERMS);
    if (byUn === undefined) {
        byUn = new WeakMap();
        mergedLists.set(base ?? NO_TERMS, byUn);
    }
    const unKey = baseLoading ? NO_TERMS : (un ?? NO_TERMS);
    let merged = byUn.get(unKey);
    if (merged === undefined) {
        merged = outsideTermList({ base, un, baseLoading });
        byUn.set(unKey, merged);
    }
    return merged;
};

/**
 * The models over one set of documents, by switch, built once per pair
 * however many screens ask, and dropped with the documents.
 */
const builtModels = new WeakMap<ModelDocuments, Map<string, ExploreModels>>();

const modelsFor = (
    documents: ModelDocuments,
    switches: Readonly<Record<OriginSwitch, boolean>>,
): ExploreModels => {
    let bySwitches = builtModels.get(documents);
    if (bySwitches === undefined) {
        bySwitches = new Map();
        builtModels.set(documents, bySwitches);
    }
    const key = ORIGIN_SWITCHES.filter((name) => switches[name]).join(' ');
    const cached = bySwitches.get(key);
    if (cached !== undefined) return cached;
    const { schema, usage, base, un } = documents;
    const models = buildModels(schema, { dfo: usage, base, un }, switches);
    bySwitches.set(key, models);
    return models;
};

export type ExplorerData = {
    /**
     * The scoped model: DFO usage and the outside usage whose switch is on.
     * The start screen, the DFO property list, the Show pills, search and
     * the seed picker read it, so the switches widen them.
     */
    readonly model: Loadable<Model>;
    /**
     * The full model, over every usage document loaded whatever the
     * switches say, once the DFO pair lands, and null before. A centred term or
     * dataset, the dataset filter, a dataset a link names to Seed a dataset
     * and the check's reading of seed headers read it. It is a new model
     * each time an outside usage document arrives.
     */
    readonly full: Model | null;
    readonly retryModel: () => void;
    /**
     * Each outside usage document's state. These load on every visit,
     * whatever the switches say. A document has settled once it loads,
     * fails or is not served (`settled` in load.ts).
     */
    readonly usage: UsageStates;
    /**
     * The outside usage documents that failed, in switch order, and empty
     * while none has. The models leave them out.
     */
    readonly usageFailed: readonly OriginSwitch[];
    /** Loads each failed outside usage document again. */
    readonly retryUsage: () => void;
    /**
     * The origin switches, set by the URL's `base` and `un` parameters. Each
     * loads its terms list for search and adds its datasets to the scoped model.
     */
    readonly switches: Readonly<Record<OriginSwitch, boolean>>;
    /** Each terms list's state while its switch is on; null while it is off. */
    readonly terms: TermsStates;
    /** The terms lists loaded while their switches are on, merged once per pair of lists, for search and the centre. */
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
    const { dfo, retryModel, usage, retryUsage, terms, loadTerms } = documents;

    useEffect(() => {
        if (base) loadTerms('base');
    }, [base, loadTerms]);
    useEffect(() => {
        if (un) loadTerms('un');
    }, [un, loadTerms]);

    const models = useMemo(
        () => (documents.documents === null ? null : modelsFor(documents.documents, { base, un })),
        [documents.documents, base, un],
    );
    // Screens memoise on the model's state, so it keeps its identity while its model does.
    const scoped = models?.scoped ?? null;
    const model = useMemo<Loadable<Model>>(() => {
        if (dfo.status !== 'ready') return dfo;
        return scoped === null ? LOADING : { status: 'ready', value: scoped };
    }, [scoped, dfo]);

    const shown: TermsStates = { base: base ? terms.base : null, un: un ? terms.un : null };
    // Search and the term sources memoise on `outside`, so every screen shares one merged list.
    const outside = mergedTerms(
        base ? loaded(terms.base) : undefined,
        un ? loaded(terms.un) : undefined,
        base && inFlight(terms.base),
    );
    return {
        model,
        full: models?.full ?? null,
        retryModel,
        usage,
        usageFailed: ORIGIN_SWITCHES.filter((name) => usage[name]?.status === 'failed'),
        retryUsage,
        switches: { base, un },
        terms: shown,
        outside,
        retryTerms: (origin) => loadTerms(origin, true),
    };
};

/** The node views and their loads. Only under ExplorerDataProvider. */
export const useNodeViews = (): NodeViews => {
    const views = useContext(NodeViewsContext);
    if (!views) throw new Error('useNodeViews is used outside ExplorerDataProvider');
    return views;
};
