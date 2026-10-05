'use client';

import classNames from 'classnames';
import Link from 'next/link';
import { Fragment, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import styles from './SourceDetail.module.scss';
import { originLine } from '@/lib/dataCommons';
import type { ChangeKind, SourceDoc, SourceRelease } from '@/lib/sources/graph';
import { httpOnly } from '@/lib/sources/url';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import CodeBox from '@/components/molecules/CodeBox/CodeBox';
import EntryCard from '@/components/molecules/EntryCard/EntryCard';
import HeroTabs from '@/components/molecules/HeroTabs/HeroTabs';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import Timeline from '@/components/molecules/Timeline/Timeline';
import { usePendingScroll } from '@/hooks/usePendingScroll';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { useUrlParam } from '@/hooks/useUrlParam';

const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'log', label: 'Transformation Log' },
    { id: 'versions', label: 'Version History' },
] as const;

type Tab = (typeof TABS)[number]['id'];

const parseTab = (raw: string | null): Tab =>
    TABS.some((t) => t.id === raw) ? (raw as Tab) : 'overview';

// A document's Markdown (CommonMark, no raw HTML). It emits its own blocks,
// so the wrapper is a div, never a p. Images are dropped so API Markdown cannot make the
// browser fetch from arbitrary external hosts.
const Markdown = ({ children, className }: { children: string; className?: string }) => (
    <div className={classNames(styles.markdown, className)}>
        <ReactMarkdown disallowedElements={['img']}>{children}</ReactMarkdown>
    </div>
);

// Keep a Changelog's order.
const CHANGE_KINDS: { kind: ChangeKind; label: string }[] = [
    { kind: 'added', label: 'Added' },
    { kind: 'changed', label: 'Changed' },
    { kind: 'deprecated', label: 'Deprecated' },
    { kind: 'removed', label: 'Removed' },
    { kind: 'fixed', label: 'Fixed' },
    { kind: 'security', label: 'Security' },
];

// One release's changes, grouped by kind: an h3 label (under the release's
// h2 title), then a note each.
const Changes = ({ changes }: { changes: SourceRelease['changes'] }) => (
    <>
        {CHANGE_KINDS.map(({ kind, label }) => {
            const notes = changes.filter((change) => change.kind === kind);

            return (
                notes.length > 0 && (
                    <section key={kind} className={styles.changeGroup}>
                        <h3 className={styles.changeKind}>{label}</h3>
                        <ul className={styles.changeNotes}>
                            {notes.map((change, index) => (
                                <li key={index}>
                                    <Markdown>{change.note}</Markdown>
                                </li>
                            ))}
                        </ul>
                    </section>
                )
            );
        })}
    </>
);

// A code box's label: the embed glyph, then the text.
const CodeLabel = ({ children }: { children: string }) => (
    <p className={classNames(styles.label, styles.labelCode)}>
        <Icon name="embed" className={styles.labelIcon} />
        {children}
    </p>
);

type Row = { label: string; value: string; href?: string };

// A label / value pair list (License & Updates, Scope & Units).
const Rows = ({ rows }: { rows: Row[] }) => (
    <>
        {rows.map((row) => (
            <Fragment key={row.label}>
                <p className={styles.label}>{row.label}</p>
                <p className={styles.value}>
                    {row.href ? (
                        <a
                            className={styles.valueLink}
                            href={row.href}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {row.value}
                        </a>
                    ) : (
                        row.value
                    )}
                </p>
            </Fragment>
        ))}
    </>
);

/**
 * Data → Sources → one source: the dark hero (back link, name, publisher,
 * the three tabs and Visit Source), then the tab's body on the light ground.
 * Overview = two-column sections; Transformation Log = numbered cards;
 * Version History = a dated timeline. Placeholder copy (see sourcesData).
 * The tab lives in the URL (?tab=log) — shareable, survives a reload.
 */
const SourceDetail = ({ dcid, doc }: { dcid: string; doc: SourceDoc }) => {
    const sectionRef = useReveal<HTMLElement>();
    const [urlTab, setTab] = useUrlParam<Tab>('tab', parseTab, (t) =>
        t === 'overview' ? null : t,
    );
    const bodyRef = useRef<HTMLDivElement>(null);
    // Switching tabs brings the body into view (the hero is tall — on a phone
    // the new content would otherwise land off screen).
    const scrollToBody = usePendingScroll(bodyRef, [urlTab]);
    const switchTab = (next: Tab) => {
        scrollToBody();
        setTab(next);
    };
    const [methodologyOpen, setMethodologyOpen] = useState(false);

    // The platform fills what it has and names the rest in `gaps`; a member
    // with no data is null / [] here. Every block below is hidden when its
    // own data is missing, so the page never shows an empty heading.
    const { details, license, scope_and_units: scope, methodology, usage } = doc;
    // The origin registry's name for the publisher when the catalogue admits
    // this source, else the graph's. The hero adds "via" for upstream data
    // and drops the publisher when this page's node is the publisher's own.
    const publisher = details.source?.label ?? details.publisher;
    const origin = originLine(
        dcid,
        details.source ?? { label: publisher },
        details.data_commons,
        details.name_of_source,
    );
    const licenseHref = httpOnly(license.url);
    const licenseRows = [
        {
            label: 'License',
            value: license.type ?? (licenseHref ? 'View license' : null),
            href: licenseHref,
        },
        { label: 'Update Cadence', value: license.update_cadence },
        { label: 'Last Update', value: license.last_update },
        { label: 'Next Expected Update', value: license.next_expected_update },
    ].filter((row): row is Row => !!row.value);
    const scopeRows = [
        { label: 'Countries', value: scope.countries.length ? scope.countries.join(', ') : null },
        { label: 'Years Covered', value: scope.years_covered },
        { label: 'Granularity', value: scope.granularity },
        { label: 'Currency', value: scope.currencies.length ? scope.currencies.join(', ') : null },
    ].filter((row): row is Row => !!row.value);
    const hasDetails = !!(
        publisher ||
        details.description ||
        details.source_data_url ||
        details.citation
    );
    const hasUsage = !!(usage.api_access?.code || usage.python?.code);
    // A tab with nothing behind it isn't offered: the platform reports both
    // of these as gaps for every source today.
    const tabs = TABS.filter(
        (entry) =>
            (entry.id !== 'log' || doc.transformation_log.length > 0) &&
            (entry.id !== 'versions' || doc.version_history.length > 0),
    );
    // A link to a tab this source doesn't offer falls back to Overview
    // rather than rendering a blank body.
    const tab = tabs.some((entry) => entry.id === urlTab) ? urlTab : 'overview';
    const sourceUrl = httpOnly(details.source_url);
    const visitSource = sourceUrl ? (
        <Button
            icon="arrow-up-right"
            wide
            onClick={() => window.open(sourceUrl, '_blank', 'noopener')}
        >
            Visit Source
        </Button>
    ) : null;

    return (
        <section ref={sectionRef} className={styles.section}>
            <PageHero tone="dark" boxFlush aside={visitSource} asideOn="desktop">
                <Link href="/data/sources" className={styles.back} data-reveal="text">
                    <Icon name="arrow" className={styles.backIcon} />
                    Sources
                </Link>
                <h1 className={styles.title} data-reveal="text" style={revealIndex(1)}>
                    {details.name_of_source}
                </h1>
                {origin && (
                    <p className={styles.org} data-reveal="text" style={revealIndex(2)}>
                        {origin}
                    </p>
                )}
                {/* Tablet / phone: Visit Source sits in the box, between the
                    publisher and the tabs (desktop hangs it off the hero's
                    right edge). */}
                {visitSource && (
                    <div className={styles.visitInline} data-reveal style={revealIndex(3)}>
                        {visitSource}
                    </div>
                )}
                {tabs.length > 1 && (
                    <div className={styles.tabs} data-reveal style={revealIndex(3)}>
                        {/* Measured from the design: every label is followed by
                        rem(105) of air, so for "Overview" the next tab lands
                        exactly at the end of the rem(180) tongue. */}
                        <HeroTabs
                            tabs={tabs}
                            value={tab}
                            onChange={switchTab}
                            air={105}
                            tongue={{ width: 180, height: 12 }}
                            gap={2}
                        />
                    </div>
                )}
            </PageHero>

            <div ref={bodyRef} className={styles.body} key={tab}>
                {doc.document_errors.length > 0 && (
                    <p className={styles.notice}>
                        Part of this source&apos;s documentation could not be displayed.
                    </p>
                )}
                {tab === 'overview' && (
                    <div className={styles.overview}>
                        {hasDetails && (
                            <section className={styles.block}>
                                <h2 className={styles.blockTitle}>Details</h2>
                                <div className={styles.blockBody}>
                                    {publisher && (
                                        <>
                                            <p className={styles.label}>Publisher</p>
                                            <p className={styles.value}>{publisher}</p>
                                        </>
                                    )}
                                    {details.description && (
                                        <>
                                            <p className={styles.label}>Description</p>
                                            <p className={styles.value}>{details.description}</p>
                                        </>
                                    )}
                                    {details.source_data_url && (
                                        <>
                                            <CodeLabel>Source data URL</CodeLabel>
                                            <CodeBox value={details.source_data_url} />
                                        </>
                                    )}
                                    {details.citation && (
                                        <>
                                            <CodeLabel>Citation</CodeLabel>
                                            <CodeBox value={details.citation} />
                                        </>
                                    )}
                                </div>
                            </section>
                        )}

                        {licenseRows.length > 0 && (
                            <section className={styles.block}>
                                <h2 className={styles.blockTitle}>License &amp; Updates</h2>
                                <div className={styles.blockBody}>
                                    <Rows rows={licenseRows} />
                                </div>
                            </section>
                        )}

                        {scopeRows.length > 0 && (
                            <section className={styles.block}>
                                <h2 className={styles.blockTitle}>Scope &amp; Units</h2>
                                <div className={styles.blockBody}>
                                    <Rows rows={scopeRows} />
                                </div>
                            </section>
                        )}

                        {methodology.description && (
                            <section className={styles.block}>
                                <h2 className={styles.blockTitle}>Methodology</h2>
                                <div className={styles.blockBody}>
                                    <Markdown
                                        className={classNames(
                                            styles.prose,
                                            !methodologyOpen && styles.proseClamped,
                                        )}
                                    >
                                        {methodology.description}
                                    </Markdown>
                                    <div className={styles.readMore}>
                                        <Button
                                            variant="bordered"
                                            onClick={() => setMethodologyOpen((v) => !v)}
                                        >
                                            {methodologyOpen ? '– Read Less' : '+ Read More'}
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        )}

                        {doc.data_notes.length > 0 && (
                            <section className={styles.block}>
                                <h2 className={styles.blockTitle}>Data Notes</h2>
                                <div className={classNames(styles.blockBody, styles.proseStack)}>
                                    {doc.data_notes.map((text, index) => (
                                        <Markdown key={index} className={styles.prose}>
                                            {text}
                                        </Markdown>
                                    ))}
                                </div>
                            </section>
                        )}

                        {hasUsage && (
                            <section className={styles.block}>
                                <h2 className={styles.blockTitle}>Usage</h2>
                                <div className={styles.blockBody}>
                                    {usage.api_access?.code && (
                                        <>
                                            <CodeLabel>API Access</CodeLabel>
                                            <CodeBox
                                                value={usage.api_access.code}
                                                link={
                                                    usage.api_access.documentation_url
                                                        ? {
                                                              label: 'View Docs',
                                                              href: usage.api_access
                                                                  .documentation_url,
                                                          }
                                                        : undefined
                                                }
                                            />
                                        </>
                                    )}
                                    {usage.python?.code && (
                                        <>
                                            <CodeLabel>Python</CodeLabel>
                                            <CodeBox
                                                value={usage.python.code}
                                                link={
                                                    usage.python.documentation_url
                                                        ? {
                                                              label: 'View Docs',
                                                              href: usage.python.documentation_url,
                                                          }
                                                        : undefined
                                                }
                                            />
                                        </>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>
                )}

                {tab === 'log' && (
                    <ol className={styles.log}>
                        {doc.transformation_log.map((step, index) => (
                            <li key={index} className={styles.logItem} style={revealIndex(index)}>
                                <span className={styles.logNumber}>
                                    {String(index + 1).padStart(2, '0')}
                                </span>
                                <EntryCard
                                    title={step.transformation}
                                    titleAs="h2"
                                    rounded
                                    padY={40}
                                >
                                    <Markdown>{step.description}</Markdown>
                                </EntryCard>
                            </li>
                        ))}
                    </ol>
                )}

                {tab === 'versions' && (
                    <Timeline
                        items={doc.version_history.map((entry, index) => ({
                            key: `${entry.date}-${index}`,
                            date: entry.date,
                            children: (
                                <EntryCard title={entry.title} titleAs="h2" rounded padY={40}>
                                    <Changes changes={entry.changes} />
                                </EntryCard>
                            ),
                        }))}
                    />
                )}
            </div>

            <PageFade />
        </section>
    );
};

export default SourceDetail;
