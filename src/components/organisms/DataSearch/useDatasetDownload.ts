'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
    choicesNeedOptions,
    DEFAULT_DOWNLOAD_CHOICES,
    type DownloadChoices,
    enrichmentGroups,
    offeredEnrichment,
    parseDownloadChoices,
    resolveChoices,
} from '@/lib/search/downloadOptions';
import type { OperationProgress } from '@/lib/search/operationPoll';
import {
    artifactHref,
    type DatasetFormat,
    type DatasetOptionsDocument,
    fetchDatasetOptions,
    mintDataset,
    pinDownloadedVersion,
} from '@/lib/search/searchClient';
import { downloadFailureMessage } from '@/lib/search/downloadMessage';
import { optionsAsker } from '@/lib/search/optionsAsker';

// The viewer's last choices, kept in this browser so the Download button
// repeats them in one click on the next answer. Storage can be missing or
// refuse a write (private browsing, a full quota); the choices then hold for
// this page only.
const CHOICES_KEY = 'dfo-download-choices';
const choiceListeners = new Set<() => void>();
let storageWorks = true;
let memoryRaw: string | null = null;
let cachedChoices: { raw: string | null; choices: DownloadChoices } = {
    raw: null,
    choices: DEFAULT_DOWNLOAD_CHOICES,
};

const readRawChoices = (): string | null => {
    if (!storageWorks) {
        return memoryRaw;
    }

    try {
        return localStorage.getItem(CHOICES_KEY);
    } catch {
        storageWorks = false;

        return memoryRaw;
    }
};

// A stable snapshot for useSyncExternalStore: parsed again only when the
// stored text changes.
const readChoices = (): DownloadChoices => {
    const raw = readRawChoices();

    if (raw !== cachedChoices.raw) {
        cachedChoices = { raw, choices: parseDownloadChoices(raw) };
    }

    return cachedChoices.choices;
};

const writeChoices = (patch: Partial<DownloadChoices>) => {
    const raw = JSON.stringify({ ...readChoices(), ...patch });

    memoryRaw = raw;

    try {
        localStorage.setItem(CHOICES_KEY, raw);
    } catch {
        storageWorks = false;
    }

    choiceListeners.forEach((listener) => listener());
};

// Another tab's choice reaches this one through the storage event.
const subscribeChoices = (listener: () => void) => {
    choiceListeners.add(listener);
    window.addEventListener('storage', listener);

    return () => {
        choiceListeners.delete(listener);
        window.removeEventListener('storage', listener);
    };
};

const serverChoices = () => DEFAULT_DOWNLOAD_CHOICES;

export type DatasetDownloadTarget = {
    specId: string | undefined;
    // The spec's canonical definition, which lets the Datasets API answer
    // for a spec it has not registered.
    definition?: unknown;
    // The answer's bound entities, whose type heads the observationAbout
    // group of extra columns ("Country").
    entities?: { role?: string; entity_type?: string | null }[] | null;
};

/**
 * The state behind the Datasets API download sheet: format, bundle and
 * enrichment choices (remembered across answers), the dataset's own options
 * document, and the mint → manifest → signed URL download. Search's panel
 * uses it, through DatasetDownload.
 */
export const useDatasetDownload = ({ specId, definition, entities }: DatasetDownloadTarget) => {
    const choices = useSyncExternalStore(subscribeChoices, readChoices, serverChoices);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [downloading, setDownloading] = useState(false);
    // The in-flight download's own controller, so a spec change or unmount
    // can abort a mint/poll that started against a now-stale spec. A ref,
    // not state: aborting must reach the promise chain `download()` is
    // still running, not trigger a render.
    const downloadAbortRef = useRef<AbortController | null>(null);
    // This spec's options document (formats, bundle, its own columns and the
    // extra columns it can join, with the role each column plays), from the
    // options door or a mint's manifest. Null until one answers, and the
    // sheet then offers all formats and the bundle so a failed lookup does
    // not block the download.
    const [optionsDocument, setOptionsDocument] = useState<DatasetOptionsDocument | null>(null);
    const [optionsPending, setOptionsPending] = useState(false);
    // Which spec's options document has been asked for or a mint has
    // brought, so the sheet asks once per spec and again after a failure,
    // and the abort handle of the ask in flight.
    const [optionsAsk] = useState(() => optionsAsker<DatasetOptionsDocument>());
    const optionsAbortRef = useRef<AbortController | null>(null);
    // The size of the last file downloaded here, keyed by what it was
    // rendered from, so a Details row shows it only for the same choices.
    const [fileSize, setFileSize] = useState<{ key: string; bytes: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Rows written against the estimate, updated on every poll of an
    // over-budget mint that runs as a background operation (202). Null for
    // an ordinary synchronous download, which never calls onProgress.
    const [progress, setProgress] = useState<OperationProgress | null>(null);

    const applyOptions = (document: DatasetOptionsDocument | null) => {
        if (document?.output_options) {
            setOptionsDocument(document);
        }
    };

    // The options door materialises the frame to answer, so it is asked
    // only when the options dialog opens, or when a download must check a
    // remembered extra against the extras the answer offers. A second caller
    // waits on the request already out.
    const requestOptions = (): Promise<DatasetOptionsDocument | null> | null => {
        if (!specId) {
            return null;
        }

        const pending = optionsAsk.pending(specId);

        if (pending) {
            return pending;
        }

        const controller = new AbortController();
        const asked = optionsAsk.ask(specId, () =>
            fetchDatasetOptions({ spec_id: specId, definition }, controller.signal),
        );

        if (!asked) {
            return null;
        }

        optionsAbortRef.current = controller;
        setOptionsPending(true);

        return asked.then((document) => {
            if (controller.signal.aborted) {
                return null;
            }

            setOptionsPending(false);
            applyOptions(document);

            return document;
        });
    };

    const openOptions = (open: boolean) => {
        setOptionsOpen(open);

        if (open) {
            requestOptions();
        }
    };

    // A download is scoped to the spec it started against. A search refining
    // its query changes the spec while its panel persists, so the previous
    // download's promise chain would otherwise keep running and apply its
    // result (a progress update, an unsolicited file open) to the new spec.
    // Aborting it stops that; the reset below clears the button back to idle,
    // since the aborted `download()`'s own `finally` skips its reset. The
    // previous spec's options document goes too, so the next spec offers
    // everything until its own answers. The viewer's choices stay.
    useEffect(() => {
        return () => {
            downloadAbortRef.current?.abort();
            optionsAbortRef.current?.abort();
            optionsAsk.reset();
            setDownloading(false);
            setProgress(null);
            setError(null);
            setOptionsDocument(null);
            setOptionsPending(false);
        };
    }, [specId, optionsAsk]);

    const outputOptions = optionsDocument?.output_options;
    // Derived instead of synced into state: the options document can arrive
    // after the viewer has picked, and a format it lacks must not survive it.
    const resolved = resolveChoices(choices, outputOptions);
    const renderingKeyOf = ({ format, bundle, columns }: ReturnType<typeof resolveChoices>) =>
        JSON.stringify([specId, format, bundle, columns ?? null]);
    const renderingKey = renderingKeyOf(resolved);

    // Download = the Datasets API (mint → manifest → signed URL, opened
    // directly; the bytes never pass through our server). A failed mint
    // surfaces its refusal.
    const download = async () => {
        if (!specId) {
            return;
        }

        const controller = new AbortController();

        downloadAbortRef.current = controller;
        setDownloading(true);
        setError(null);
        setProgress(null);

        try {
            // A remembered extra column is posted after the frame's own
            // columns, which only the options document lists, and only when
            // this answer offers it; a remembered format other than CSV
            // only when this answer renders it. Without a document the file
            // is the dataset as is.
            let options = outputOptions;

            if (!options && choicesNeedOptions(choices)) {
                options = (await requestOptions())?.output_options ?? undefined;

                if (controller.signal.aborted) {
                    return;
                }
            }

            const minted = resolveChoices(choices, options);
            const { format, bundle, columns } = minted;

            // A mint returns the ONE artifact it just rendered (a bundle zip
            // when bundle=true). An over-budget mint answers 202 instead;
            // mintDataset polls it to the same shape, calling onProgress on
            // every poll. The signal aborts both once the spec moves on or
            // the sheet unmounts.
            const { artifacts, manifest } = await mintDataset(
                {
                    spec_id: specId,
                    definition: definition ?? undefined,
                    format,
                    bundle,
                    // No extras chosen → no column list at all (the dataset as is).
                    columns,
                },
                controller.signal,
                (next) => {
                    if (!controller.signal.aborted) {
                        setProgress(next);
                    }
                },
            );

            if (controller.signal.aborted) {
                return;
            }

            // The mint answers with this definition's own options and
            // coverage, so the sheet need not ask the options door for them.
            applyOptions(manifest as DatasetOptionsDocument | null);
            optionsAsk.answered(specId);

            const artifact = artifacts.find((a) => typeof a.url === 'string') ?? null;

            if (!artifact?.url) {
                throw new Error('The dataset manifest carried no download URL');
            }

            if (typeof artifact.bytes === 'number') {
                setFileSize({
                    key: renderingKeyOf(minted),
                    bytes: artifact.bytes,
                });
            }

            // The bundle prints a link to this exact version; pinning the
            // version keeps that link opening, and its rows readable, past
            // the working tier's 30 days.
            if (typeof manifest?.content_version === 'string') {
                pinDownloadedVersion({
                    specId: manifest.definition?.spec_id ?? specId,
                    contentVersion: manifest.content_version,
                    definition: definition ?? null,
                });
            }

            window.location.assign(artifactHref(artifact.url));
        } catch (caught) {
            if (controller.signal.aborted) {
                return;
            }

            setError(downloadFailureMessage(caught));
        } finally {
            if (!controller.signal.aborted) {
                setDownloading(false);
                setProgress(null);
            }
        }
    };

    // Toggling an extra this answer offers adds or drops its token; the
    // tokens other answers offered stay remembered.
    const toggleEnrichment = (token: string) =>
        writeChoices({
            enrichment: choices.enrichment.includes(token)
                ? choices.enrichment.filter((other) => other !== token)
                : [...choices.enrichment, token],
        });

    return {
        optionsOpen,
        openOptions,
        optionsPending,
        formatChoices: resolved.formats,
        format: resolved.format,
        setFormat: (format: DatasetFormat) => writeChoices({ format }),
        bundleOffered: resolved.bundleOffered,
        bundle: choices.bundle,
        toggleBundle: () => writeChoices({ bundle: !choices.bundle }),
        // The extras this answer offers, by the column they join onto.
        enrichmentGroups: enrichmentGroups({
            options: outputOptions,
            dimensions: optionsDocument?.coverage?.dimensions,
            entities,
        }),
        enrichment: offeredEnrichment(choices.enrichment, outputOptions),
        toggleEnrichment,
        downloading,
        progress,
        error,
        download,
        // The size of the file the current choices last produced, if known.
        fileBytes: fileSize?.key === renderingKey ? fileSize.bytes : null,
    };
};

export type DatasetDownloadState = ReturnType<typeof useDatasetDownload>;
