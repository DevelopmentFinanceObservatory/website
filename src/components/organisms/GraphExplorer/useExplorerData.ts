'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { LoadError, loadDocument } from '@/lib/graphExplorer/load';
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

/** Loading, waiting for a build (`retryInMs` set), loaded, or failed with a message. */
export type Loadable<TValue> =
    | { readonly status: 'loading'; readonly retryInMs: number | null }
    | { readonly status: 'ready'; readonly value: TValue }
    | { readonly status: 'failed'; readonly message: string };

const LOADING = { status: 'loading', retryInMs: null } as const;

const failure = (error: unknown): Loadable<never> => ({
    status: 'failed',
    message: error instanceof LoadError ? error.message : 'Something went wrong reading the model.',
});

export type ExplorerData = {
    readonly model: Loadable<Model>;
    readonly retryModel: () => void;
    /** Whether search reaches base Data Commons terms outside the model. */
    readonly includeBase: boolean;
    /** The terms list, loaded the first time `includeBase` turns on; null before. */
    readonly terms: Loadable<OntologyTerms> | null;
    readonly setIncludeBase: (on: boolean) => void;
};

/**
 * The ontology and provenances documents, fetched once and built into one
 * model, and the terms list behind the base Data Commons search switch.
 */
export const useExplorerData = (): ExplorerData => {
    const [model, setModel] = useState<Loadable<Model>>(LOADING);
    const [attempt, setAttempt] = useState(0);
    const [includeBase, setIncludeBaseState] = useState(false);
    const [terms, setTerms] = useState<Loadable<OntologyTerms> | null>(null);
    const termsAbort = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const options = {
            signal: controller.signal,
            onWait: (retryInMs: number) => {
                if (!controller.signal.aborted) setModel({ status: 'loading', retryInMs });
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
                setModel(failure(error));
            }
        })();

        return () => controller.abort();
    }, [attempt]);

    useEffect(() => () => termsAbort.current?.abort(), []);

    const retryModel = useCallback(() => {
        setModel(LOADING);
        setAttempt((n) => n + 1);
    }, []);

    const loadTerms = useCallback(() => {
        termsAbort.current?.abort();
        const controller = new AbortController();
        termsAbort.current = controller;
        setTerms(LOADING);
        loadDocument('Base Data Commons terms', TERMS_URL, readTerms, {
            signal: controller.signal,
            onWait: (retryInMs) => setTerms({ status: 'loading', retryInMs }),
        }).then(
            (value) => setTerms({ status: 'ready', value }),
            (error: unknown) => {
                if (!controller.signal.aborted) setTerms(failure(error));
            },
        );
    }, []);

    const setIncludeBase = useCallback(
        (on: boolean) => {
            setIncludeBaseState(on);
            if (on && (terms === null || terms.status === 'failed')) loadTerms();
        },
        [terms, loadTerms],
    );

    return { model, retryModel, includeBase, terms, setIncludeBase };
};
