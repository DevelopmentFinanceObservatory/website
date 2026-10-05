'use client';

import styles from './DataSearch.module.scss';
import DownloadOptions from './DownloadOptions';
import type { DatasetDownloadState } from './useDatasetDownload';

import Button from '@/components/atoms/Button/Button';
import { operationProgressText } from '@/lib/search/view';

/** What the sheet and its dialog read: Search's useDatasetDownload and a
 *  Studio card's useCardDownload both return it. */
export type DownloadSheetState = Pick<
    DatasetDownloadState,
    | 'optionsOpen'
    | 'openOptions'
    | 'optionsPending'
    | 'formatChoices'
    | 'format'
    | 'setFormat'
    | 'bundleOffered'
    | 'bundle'
    | 'toggleBundle'
    | 'enrichmentGroups'
    | 'enrichment'
    | 'toggleEnrichment'
    | 'downloading'
    | 'progress'
    | 'error'
    | 'download'
>;

/**
 * The download sheet: the Download button, which repeats the viewer's last
 * choices in one click, the chevron that opens the Download options dialog
 * (format, the bundle's README and citations, the extra columns this
 * dataset offers), and the refusal line. State comes from useDatasetDownload
 * or, for a Studio card, useCardDownload.
 */
const DatasetDownload = ({ state }: { state: DownloadSheetState }) => {
    const label = state.downloading
        ? state.progress
            ? operationProgressText(state.progress)
            : 'Preparing…'
        : `Download ${
              state.formatChoices.find((entry) => entry.id === state.format)?.label ?? state.format
          }`;

    return (
        <>
            <div className={styles.downloadRow}>
                <Button full onClick={() => state.download()} disabled={state.downloading}>
                    {label}
                </Button>
                <Button
                    icon="chevron-down"
                    aria-label="Download options"
                    aria-haspopup="dialog"
                    aria-expanded={state.optionsOpen}
                    data-open={state.optionsOpen}
                    onClick={() => state.openOptions(true)}
                />
            </div>
            <DownloadOptions state={state} downloadLabel={label} />

            {state.error && (
                <p className={styles.downloadError} role="alert">
                    {state.error}
                </p>
            )}
        </>
    );
};

export default DatasetDownload;
