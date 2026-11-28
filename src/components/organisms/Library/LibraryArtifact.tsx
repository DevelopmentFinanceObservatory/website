import classNames from 'classnames';
import Link from 'next/link';
import { Fragment } from 'react';

import ArtifactToc from './ArtifactToc';
import EditArtifact from './EditArtifact';
import EmbedFrame from './EmbedFrame';
import styles from './LibraryArtifact.module.scss';
import { KIND_ICONS, StatusBadge, TopicTags } from './parts';
import ShareButton from './ShareButton';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import CodeBox from '@/components/molecules/CodeBox/CodeBox';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import {
    artifactPath,
    citation,
    KIND_LABELS,
    LIBRARY_AUTHOR,
    type LibraryArtifact as Artifact,
    libraryDate,
    type LibraryStep,
    type ReplacementChoice,
    textUpdated,
} from '@/lib/library/artifact';
import { parseProse } from '@/lib/library/prose';
import { dataThroughText } from '@/lib/studio/dataThrough';

const pad = (index: number) => String(index + 1).padStart(2, '0');

// The publisher's text (parseProse): paragraphs with their line breaks, and
// lists.
const Prose = ({ text }: { text: string }) => (
    <>
        {parseProse(text).map((block, index) =>
            block.type === 'list' ? (
                <ul key={index} className={styles.bullets}>
                    {block.items.map((item, position) => (
                        <li key={position}>{item}</li>
                    ))}
                </ul>
            ) : (
                <p key={index} className={styles.paragraph}>
                    {block.lines.map((line, position) => (
                        <Fragment key={position}>
                            {position > 0 && <br />}
                            {line}
                        </Fragment>
                    ))}
                </p>
            ),
        )}
    </>
);

// One step of the method, as the card's info panel shows it: the verb and
// its object ("Get · Gross national income"), with the step's sentence one
// click away. A step stored without its two halves shows its title.
const MethodStep = ({ step, index }: { step: LibraryStep; index: number }) => {
    const label = (
        <span className={styles.stepLabel}>
            {step.verb && step.object ? (
                <>
                    <b>{step.verb}</b>
                    <i className={styles.stepDot}>·</i>
                    {step.object}
                </>
            ) : (
                (step.object ?? step.title)
            )}
        </span>
    );

    return (
        <li className={styles.step}>
            <span className={styles.stepIndex}>{pad(index)}</span>
            {step.detail ? (
                <details className={styles.stepMore}>
                    <summary className={styles.stepRow}>
                        {label}
                        <Icon name="chevron-down" className={styles.stepChevron} />
                    </summary>
                    <p className={styles.stepDetail}>{step.detail}</p>
                </details>
            ) : (
                <span className={styles.stepRow}>{label}</span>
            )}
        </li>
    );
};

/**
 * One Library artifact's page: the dark hero (back to the Library, title,
 * description), then the artifact drawn by its share's embed, the
 * publisher's text, its sources with the full citation, and the method, the
 * steps it was built by. Beside them, on the right, Share and Open in Studio and the
 * artifact's type, status, publication and topics; on the left, the page's
 * sections. A phone stacks the artifact, the details, then the sections.
 *
 * A live artifact's data follows its source. The embed of a live chart,
 * table, key number or canvas says how recent it is, and a data artifact's
 * page names no period. A snapshot's details say how recent its data was
 * when published, one period for a card and the earliest and latest for a
 * canvas.
 *
 * `origin` is the site's own, for the citation. `accessed` is the day the
 * page was rendered, which the citation names. `replacements` gives an admin
 * the Edit button under the two actions, with the artifacts on show its
 * Delete can name as the replacement.
 */
const LibraryArtifact = ({
    artifact,
    origin,
    accessed,
    replacements,
}: {
    artifact: Artifact;
    origin: string;
    accessed: Date;
    replacements?: readonly ReplacementChoice[];
}) => {
    const dataThrough =
        artifact.mode === 'snapshot'
            ? dataThroughText(artifact.cardDates.map((dates) => dates.dataThrough))
            : null;
    const studioHref =
        artifact.kind === 'data' ? `/data?share=${artifact.shareId}` : `/s/${artifact.shareId}`;
    const sections = [
        { id: 'artifact', label: 'Artifact' },
        ...(artifact.content
            ? [{ id: 'findings', label: artifact.contentTitle ?? 'Key Findings' }]
            : []),
        { id: 'sources', label: 'Sources' },
        ...(artifact.steps.length > 0 ? [{ id: 'method', label: 'Method' }] : []),
    ];

    return (
        <section className={styles.section}>
            <PageHero tone="dark" boxMinHeight={220}>
                <Link href="/library" prefetch={false} className={styles.back}>
                    <span className={styles.backIcon} aria-hidden="true">
                        <Icon name="arrow" />
                    </span>
                    Library
                </Link>
                <h1 className={styles.title}>{artifact.title}</h1>
                {artifact.description && <p className={styles.lead}>{artifact.description}</p>}
            </PageHero>

            <div className={styles.body}>
                <ArtifactToc sections={sections} />

                <div id="artifact" className={styles.artifact}>
                    {artifact.kind === 'data' ? (
                        <div className={styles.dataBox}>
                            <Icon name={KIND_ICONS.data} className={styles.dataIcon} />
                            <p>
                                A dataset from the DFO search, with its parts and their downloads.
                            </p>
                            <Button href={studioHref} prefetch={false} variant="dark" icon="arrow">
                                Open the data
                            </Button>
                        </div>
                    ) : (
                        <EmbedFrame
                            className={classNames(
                                styles.frame,
                                artifact.kind === 'canvas' && styles.frameCanvas,
                            )}
                            src={`/embed/${artifact.shareId}`}
                            title={artifact.title}
                        />
                    )}
                </div>

                <aside className={styles.aside}>
                    <div className={styles.actions}>
                        <ShareButton url={`${origin}${artifactPath(artifact.slug)}`} />
                        <Button
                            href={studioHref}
                            prefetch={false}
                            variant="light"
                            full
                            icon="arrow"
                        >
                            Open in Studio
                        </Button>
                        {replacements && (
                            <EditArtifact artifact={artifact} replacements={replacements} />
                        )}
                    </div>
                    <dl className={styles.facts}>
                        <div className={styles.fact}>
                            <dt>Type</dt>
                            <dd className={styles.type}>
                                <Icon name={KIND_ICONS[artifact.kind]} />
                                {KIND_LABELS[artifact.kind]}
                            </dd>
                        </div>
                        <div className={styles.fact}>
                            <dt className={styles.statusRow}>
                                Status
                                <StatusBadge mode={artifact.mode} />
                            </dt>
                            <dd>
                                {artifact.mode === 'live'
                                    ? 'Live: follows the source'
                                    : `Pinned: shows the data as published on ${libraryDate(artifact.publishedAt)}`}
                            </dd>
                        </div>
                        {dataThrough && (
                            <div className={styles.fact}>
                                <dt>Data through</dt>
                                <dd>{dataThrough}</dd>
                            </div>
                        )}
                        <div className={styles.fact}>
                            <dt>Published</dt>
                            <dd>
                                {libraryDate(artifact.publishedAt)} by {LIBRARY_AUTHOR}
                            </dd>
                        </div>
                        {textUpdated(artifact) && (
                            <div className={styles.fact}>
                                <dt>Text updated</dt>
                                <dd>{libraryDate(artifact.updatedAt)}</dd>
                            </div>
                        )}
                        {artifact.topics.length > 0 && (
                            <div className={styles.fact}>
                                <dt>Topics</dt>
                                <dd>
                                    <TopicTags topics={artifact.topics} />
                                </dd>
                            </div>
                        )}
                    </dl>
                </aside>

                <div className={styles.rest}>
                    {artifact.content && (
                        <section id="findings" className={styles.block}>
                            <h2 className={styles.heading}>
                                {artifact.contentTitle ?? 'Key Findings'}
                            </h2>
                            <Prose text={artifact.content} />
                        </section>
                    )}

                    <section id="sources" className={styles.block}>
                        <h2 className={styles.heading}>Sources</h2>
                        {artifact.sources.length > 0 && (
                            <ul className={styles.sources}>
                                {artifact.sources.map((source) => (
                                    <li key={source.name} className={styles.source}>
                                        <span>{source.name}</span>
                                        {source.url && (
                                            <a
                                                className={styles.explore}
                                                href={source.url}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Explore Source
                                                <Icon name="arrow" className={styles.exploreIcon} />
                                            </a>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className={styles.citationLabel}>Full Citation</p>
                        <CodeBox value={citation(artifact, origin, accessed)} />
                    </section>

                    {artifact.steps.length > 0 && (
                        <section id="method" className={styles.block}>
                            <h2 className={styles.heading}>Method</h2>
                            <ol className={styles.steps}>
                                {artifact.steps.map((step, index) => (
                                    <MethodStep key={index} step={step} index={index} />
                                ))}
                            </ol>
                        </section>
                    )}
                </div>
            </div>

            <PageFade />
        </section>
    );
};

export default LibraryArtifact;
