'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useCarried } from './ExploreContext';

import {
    LOADING,
    loadDocument,
    loadFailure,
    sharedLoad,
    type Loadable,
    type WaitCause,
} from '@/lib/graphExplorer/load';
import { buildModel, type Model } from '@/lib/graphExplorer/model';
import {
    readOntology,
    readProvenances,
    readTerms,
    type OntologyTerms,
} from '@/lib/graphExplorer/wire';

const ONTOLOGY_URL = '/api/graph/ontology';
const PROVENANCES_URL = '/api/graph/ontology/provenances';
const TERMS_URL = '/api/graph/ontology/terms';

type LoadedDocuments = {
    readonly model: Loadable<Model>;
    readonly retryModel: () => void;
    /** The terms list behind the base Data Commons switch; null until first asked for. */
    readonly terms: Loadable<OntologyTerms> | null;
    /** Loads the terms list unless it is loading or loaded; `retry` also reloads a failed one. */
    readonly loadTerms: (retry?: boolean) => void;
};

const DocumentsContext = createContext<LoadedDocuments | null>(null);

/**
 * The ontology and provenances documents, built into one model, and the
 * terms list behind the base switch. It sits in the section's layout, which
 * stays mounted while the reader moves between Explore, Start a sheet and
 * Check a sheet, so each document loads once per visit.
 */
export const ExplorerDataProvider = ({ children }: { children: React.ReactNode }) => {
    const [model, setModel] = useState<Loadable<Model>>(LOADING);
    const [attempt, setAttempt] = useState(0);
    const [terms, setTerms] = useState<Loadable<OntologyTerms> | null>(null);
    const [termsLoad] = useState(() =>
        sharedLoad({
            load: (options) =>
                loadDocument('Base Data Commons terms', TERMS_URL, readTerms, options),
            publish: setTerms,
        }),
    );

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
                const [ontology, provenances] = await Promise.all([
                    loadDocument('The ontology', ONTOLOGY_URL, readOntology, options),
                    loadDocument(
                        'The datasets document',
                        PROVENANCES_URL,
                        readProvenances,
                        options,
                    ),
                ]);
                setModel({ status: 'ready', value: buildModel(ontology, provenances) });
            } catch (error) {
                if (controller.signal.aborted) return;
                controller.abort();
                setModel(loadFailure(error));
            }
        })();

        return () => controller.abort();
    }, [attempt]);

    // An abort forgets a load still running, so StrictMode's second mount starts it again.
    useEffect(() => () => termsLoad.abort(), [termsLoad]);

    const retryModel = useCallback(() => {
        setModel(LOADING);
        setAttempt((n) => n + 1);
    }, []);

    return (
        <DocumentsContext.Provider value={{ model, retryModel, terms, loadTerms: termsLoad.start }}>
            {children}
        </DocumentsContext.Provider>
    );
};

export type ExplorerData = {
    readonly model: Loadable<Model>;
    readonly retryModel: () => void;
    /** Whether search reaches base Data Commons terms: the URL's `base` parameter. */
    readonly base: boolean;
    /** The terms list while `base` is on; null while it is off. */
    readonly terms: Loadable<OntologyTerms> | null;
    /** The terms list once loaded while `base` is on, for search and the centre. */
    readonly baseTerms: OntologyTerms | undefined;
    readonly retryTerms: () => void;
};

/**
 * The loaded documents for one screen, with the terms list loaded whenever
 * the URL turns the base switch on. Only under ExplorerDataProvider.
 */
export const useExplorerData = (): ExplorerData => {
    const documents = useContext(DocumentsContext);
    if (!documents) throw new Error('useExplorerData is used outside ExplorerDataProvider');
    const { base } = useCarried();
    const { model, retryModel, terms, loadTerms } = documents;

    useEffect(() => {
        if (base) loadTerms();
    }, [base, loadTerms]);

    const shownTerms = base ? terms : null;
    return {
        model,
        retryModel,
        base,
        terms: shownTerms,
        baseTerms: shownTerms?.status === 'ready' ? shownTerms.value : undefined,
        retryTerms: () => loadTerms(true),
    };
};
