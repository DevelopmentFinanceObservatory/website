'use client';

import { useState } from 'react';

import { useStudioVariant } from './studioContext';

import type { DownloadSheetState } from '@/components/organisms/DataSearch/DatasetDownload';
import type { CardRef, Widget } from '@/lib/chat/widgets';
import { downloadBlob } from '@/lib/download';
import { track } from '@/lib/events/client';
import type { StudioDownloadProps } from '@/lib/events/studioDownload';
import { DATASET_FORMATS, type DatasetFormat } from '@/lib/search/searchClient';
import {
    CardDownloadError,
    cardDownloadMessage,
    fetchCardData,
    type SharedCardAddress,
} from '@/lib/studio/cardDownload';

/**
 * The download sheet's state for one card's own rows, over the export
 * route, or over the share's data route when `shared` names the card on a
 * share. Either route takes a format and the bundle flag only, so the
 * sheet offers no extra columns, and keeps its choices for this card only.
 * A saved file records `studio.download` with the card's `kind`.
 */
export const useCardDownload = (
    ref: CardRef,
    kind: Widget['kind'],
    shared: SharedCardAddress | null = null,
): DownloadSheetState => {
    const [format, setFormat] = useState<DatasetFormat>('csv');
    const [bundle, setBundle] = useState(true);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const variant = useStudioVariant();

    const download = async () => {
        setDownloading(true);
        setError(null);

        try {
            const { blob, fileName } = await fetchCardData(ref, { format, bundle }, { shared });

            downloadBlob(blob, fileName);
            track('studio.download', {
                format,
                bundle,
                kind,
                cardId: ref.component_id,
                shared: shared !== null,
                source: 'card',
                variant,
            } satisfies StudioDownloadProps);
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
