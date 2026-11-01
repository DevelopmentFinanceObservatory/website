'use client';

import { useId, useState } from 'react';

import styles from './DownloadOptions.module.scss';
import type { DownloadSheetState } from './DatasetDownload';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import SegmentedTabs from '@/components/molecules/SegmentedTabs/SegmentedTabs';
import { inFileNote, type EnrichmentGroup } from '@/lib/search/downloadOptions';
import type { DatasetFormat } from '@/lib/search/searchClient';

// What the bundle switch adds beside the data file.
const BUNDLE_FILES =
    'README.md, SOURCES.md, CITATION.cff and datapackage.json, zipped with the data';

/** A checkbox row: a visible box, a name, and a quiet detail line under it. */
const CheckRow = ({
    checked,
    name,
    detail,
    onToggle,
}: {
    checked: boolean;
    name: string;
    detail: string | null;
    onToggle: () => void;
}) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        className={styles.check}
        onClick={onToggle}
    >
        <span className={styles.box} aria-hidden="true">
            <Icon name="check" />
        </span>
        <span className={styles.checkText}>
            <span className={styles.checkName}>{name}</span>
            {detail && <span className={styles.checkDetail}>{detail}</span>}
        </span>
    </button>
);

// One entity column's extras under the role it plays ("Recipient").
const ExtraColumns = ({ group, state }: { group: EnrichmentGroup; state: DownloadSheetState }) => {
    const headingId = useId();

    return (
        <div className={styles.role} role="group" aria-labelledby={headingId}>
            <p id={headingId} className={styles.roleTitle}>
                {group.heading}
            </p>
            <div className={styles.rows}>
                {group.entries.map((entry) => (
                    <CheckRow
                        key={entry.token}
                        checked={state.enrichment.includes(entry.token)}
                        name={entry.name}
                        detail={entry.detail}
                        onToggle={() => state.toggleEnrichment(entry.token)}
                    />
                ))}
            </div>
        </div>
    );
};

// The extra columns behind a closed disclosure: its count says how many the
// answer offers, or how many the viewer has added.
const Extras = ({ state }: { state: DownloadSheetState }) => {
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const groups = state.enrichmentGroups;
    const available = groups.reduce((sum, group) => sum + group.entries.length, 0);
    const note = inFileNote(groups);

    if (available === 0) {
        return <p className={styles.note}>Checking which columns this data can add…</p>;
    }

    return (
        <>
            <button
                type="button"
                className={styles.disclose}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((prev) => !prev)}
            >
                Extra columns
                <span className={styles.discloseCount}>
                    {state.enrichment.length
                        ? `${state.enrichment.length} added`
                        : `${available} available`}
                </span>
                <Icon name="chevron-down" />
            </button>
            {open && (
                <div id={panelId} className={styles.extras}>
                    {note && <p className={styles.inFile}>{note}</p>}
                    {groups.map((group) => (
                        <ExtraColumns key={group.column} group={group} state={state} />
                    ))}
                </div>
            )}
        </>
    );
};

/**
 * The "Download options" dialog behind the Download button's chevron: the
 * format, one switch for the README, sources and citation files, and the
 * extra columns this dataset can join, folded, grouped by the role of the
 * column they join onto. The body scrolls under a pinned Download button.
 * Choices are remembered, so the Download button beside the chevron repeats
 * them in one click.
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
                variant="dark"
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
                    <CheckRow
                        checked={state.bundle}
                        name="README, sources and citation"
                        detail={BUNDLE_FILES}
                        onToggle={state.toggleBundle}
                    />
                </section>
            )}
            {(state.enrichmentGroups.length > 0 || state.optionsPending) && (
                <section className={styles.section}>
                    <Extras state={state} />
                </section>
            )}
        </div>
    </Modal>
);

export default DownloadOptions;
