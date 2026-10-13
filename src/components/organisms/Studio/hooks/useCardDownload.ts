'use client';

import { useState } from 'react';

import type { DownloadSheetState } from '@/components/organisms/DataSearch/DatasetDownload';
import type { CardRef } from '@/lib/chat/widgets';
import { downloadBlob } from '@/lib/download';
import { DATASET_FORMATS, type DatasetFormat } from '@/lib/search/searchClient';
import {
    CardDownloadError,
    cardDownloadMessage,
    fetchCardData,
    type LiveCardAddress,
} from '@/lib/studio/cardDownload';

/**
 * The download sheet's state for one card's own rows, over the export
 * route, or over the share's data route when `live` names the card on a
 * live share. Either route takes a format and the bundle flag only, so the
 * sheet offers no extra columns, and keeps its choices for this card only.
 */
export const useCardDownload = (
    ref: CardRef,
    live: LiveCardAddress | null = null,
): DownloadSheetState => {
    const [format, setFormat] = useState<DatasetFormat>('csv');
    const [bundle, setBundle] = useState(true);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const download = async () => {
        setDownloading(true);
        setError(null);

        try {
            const { blob, fileName } = await fetchCardData(ref, { format, bundle }, { live });

            downloadBlob(blob, fileName);
        } catch (caught) {
            setError(
                caught instanceof CardDownloadError ? caught.message : cardDownloadMessage(null),
            );
        } finally {
            setDownloading(false);
        }
    };

    return {
        optionsOpen,
        openOptions: setOptionsOpen,
        optionsPending: false,
        formatChoices: [...DATASET_FORMATS],
        format,
        setFormat,
        bundleOffered: true,
        bundle,
        toggleBundle: () => setBundle((prev) => !prev),
        enrichmentGroups: [],
        enrichment: [],
        totalsNote: null,
        toggleEnrichment: () => {},
        downloading,
        progress: null,
        error,
        download,
    };
};
