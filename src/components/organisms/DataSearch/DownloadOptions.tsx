'use client';

import { useId } from 'react';

import styles from './DownloadOptions.module.scss';
import dataSearchStyles from './DataSearch.module.scss';
import { OptionRow } from './SlotMenu';
import type { DownloadSheetState } from './DatasetDownload';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';
import SegmentedTabs from '@/components/molecules/SegmentedTabs/SegmentedTabs';
import { coverageNote, enrichmentLabel, type EnrichmentGroup } from '@/lib/search/downloadOptions';
import type { DatasetFormat } from '@/lib/search/searchClient';

// One entity column's extras under the role it plays ("Recipient").
const ExtraColumns = ({ group, state }: { group: EnrichmentGroup; state: DownloadSheetState }) => {
    const headingId = useId();

    return (
        <div className={styles.role} role="group" aria-labelledby={headingId}>
            <p id={headingId} className={styles.roleTitle}>
                {group.heading}
            </p>
            <div className={dataSearchStyles.downloadOptions}>
                {group.entries.map((entry) => (
                    <OptionRow
                        key={entry.token}
                        checked={state.enrichment.includes(entry.token)}
                        toggle
                        role="checkbox"
                        meta={coverageNote(entry)}
                        onClick={() => state.toggleEnrichment(entry.token)}
                    >
                        {enrichmentLabel(entry)}
                    </OptionRow>
                ))}
            </div>
        </div>
    );
};

/**
 * The "Download options" dialog behind the Download button's chevron: the
 * format, the bundle's README and citations, and the extra columns this
 * dataset can join, grouped by the role of the column they join onto. The
 * body scrolls under a pinned Download button. Choices are remembered, so
 * the Download button beside the chevron repeats them in one click.
 */
const DownloadOptions = ({
    state,
    downloadLabel,
}: {
    state: DownloadSheetState;
    downloadLabel: string;
}) => (
    <Modal
        open={state.optionsOpen}
        onOpenChange={state.openOptions}
        title="Download options"
        placement="center"
        autoFocus
        footer={
            <Button
                full
                disabled={state.downloading}
                onClick={() => {
                    state.openOptions(false);
                    void state.download();
                }}
            >
                {downloadLabel}
            </Button>
        }
    >
        <div className={styles.options}>
            {state.formatChoices.length > 0 && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Format</h3>
                    <div className={styles.tabs}>
                        <SegmentedTabs
                            tabs={state.formatChoices}
                            value={state.format}
                            onChange={(id) => state.setFormat(id as DatasetFormat)}
                        />
                    </div>
                    {state.totalsNote && <p className={styles.note}>{state.totalsNote}</p>}
                </section>
            )}
            {state.bundleOffered && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Include</h3>
                    {/* One engine flag behind both rows: the bundle ships
                        README + citations (+ the datapackage descriptor)
                        together, so the rows check and uncheck as a pair. */}
                    <div className={dataSearchStyles.downloadOptions}>
                        <OptionRow
                            checked={state.bundle}
                            toggle
                            role="checkbox"
                            onClick={state.toggleBundle}
                        >
                            README
                        </OptionRow>
                        <OptionRow
                            checked={state.bundle}
                            toggle
                            role="checkbox"
                            onClick={state.toggleBundle}
                        >
                            Sources &amp; Citations
                        </OptionRow>
                    </div>
                </section>
            )}
            {(state.enrichmentGroups.length > 0 || state.optionsPending) && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Additional columns</h3>
                    {state.enrichmentGroups.length > 0 ? (
                        state.enrichmentGroups.map((group) => (
                            <ExtraColumns key={group.column} group={group} state={state} />
                        ))
                    ) : (
                        <p className={styles.pending}>Checking which columns this data can add…</p>
                    )}
                </section>
            )}
        </div>
    </Modal>
);

export default DownloadOptions;
