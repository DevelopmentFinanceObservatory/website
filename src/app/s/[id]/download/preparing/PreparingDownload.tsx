'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from './PreparingDownload.module.scss';

import { pollOperation, type OperationProgress } from '@/lib/search/operationPoll';
import { artifactHref, pinDownloadedVersion } from '@/lib/search/searchClient';
import { renderedFile } from '@/lib/search/shareDownload';
import type { FileRendering } from '@/lib/search/snapshot';
import type { VersionLinkDocument } from '@/lib/search/versionLink';

type Stage =
    | { kind: 'preparing'; progress: OperationProgress | null }
    | { kind: 'started'; url: string }
    | { kind: 'failed' };

/**
 * Polls the Datasets API operation building a share's file, through the
 * site's own proxy, then pins the version (as the search page pins its own
 * downloads) and sends the browser to the file of the rendering asked for
 * (`renderedFile`).
 */
const PreparingDownload = ({
    shareId,
    preparing,
}: {
    shareId: string;
    preparing: { operationId: string; rendering: FileRendering } | null;
}) => {
    const [stage, setStage] = useState<Stage>(
        preparing ? { kind: 'preparing', progress: null } : { kind: 'failed' },
    );
    const operationId = preparing?.operationId;
    const format = preparing?.rendering.format;
    const bundle = preparing?.rendering.bundle;

    useEffect(() => {
        if (!operationId || !format || bundle === undefined) {
            return;
        }

        const controller = new AbortController();

        const prepare = async () => {
            try {
                const manifest = (await pollOperation(
                    {
                        operation_id: operationId,
                        status: 'pending',
                        poll: `/api/datasets/operations/${operationId}`,
                    },
                    {
                        signal: controller.signal,
                        onProgress: (progress) => setStage({ kind: 'preparing', progress }),
                    },
                )) as VersionLinkDocument | null;
                const file = renderedFile(manifest, { format, bundle });

                if (!manifest || !file) {
                    throw new Error('The finished operation listed no file');
                }

                const specId = manifest.definition?.spec_id;

                if (specId && manifest.content_version) {
                    pinDownloadedVersion({
                        specId,
                        contentVersion: manifest.content_version,
                        definition: null,
                    });
                }

                const href = artifactHref(file.url);

                setStage({ kind: 'started', url: href });
                window.location.assign(href);
            } catch (error) {
                if (controller.signal.aborted) {
                    return;
                }

                console.error('The shared download could not be prepared', error);
                setStage({ kind: 'failed' });
            }
        };

        void prepare();

        return () => controller.abort();
    }, [operationId, format, bundle]);

    return (
        <section className={styles.section} aria-live="polite">
            {stage.kind === 'preparing' && (
                <>
                    <h1 className={styles.title}>Preparing your download</h1>
                    <p className={styles.lead}>
                        This dataset is large, so it takes a moment to build. The download starts on
                        its own.
                    </p>
                    {stage.progress && stage.progress.estimate_rows > 0 && (
                        <p className={styles.progress}>
                            {stage.progress.rows_written.toLocaleString()} of about{' '}
                            {stage.progress.estimate_rows.toLocaleString()} rows
                        </p>
                    )}
                </>
            )}
            {stage.kind === 'started' && (
                <>
                    <h1 className={styles.title}>Your download has started</h1>
                    <p className={styles.lead}>
                        If it has not, <a href={stage.url}>download the file</a>.
                    </p>
                </>
            )}
            {stage.kind === 'failed' && (
                <>
                    <h1 className={styles.title}>The download could not be prepared</h1>
                    <p className={styles.lead}>
                        <Link href={`/s/${encodeURIComponent(shareId)}`}>Open the share</Link> to
                        download the data from the page.
                    </p>
                </>
            )}
        </section>
    );
};

export default PreparingDownload;
