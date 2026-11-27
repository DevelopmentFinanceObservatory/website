import classNames from 'classnames';
import Link from 'next/link';
import { Fragment } from 'react';

import ArtifactToc from './ArtifactToc';
import EditArtifact from './EditArtifact';
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
    type LibraryArtifact as Artifact,
    publishedDate,
} from '@/lib/library/artifact';
import { parseProse } from '@/lib/library/prose';

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

/**
 * One Library artifact's page: the dark hero (back to the Library, title,
 * description), then the artifact drawn by its share's embed, the
 * publisher's text, the steps it was built by and its sources with the full
 * citation. Beside them, on the right, Share and Open in Studio and the
 * artifact's type, status, publication and topics; on the left, the page's
 * sections. A phone stacks the artifact, the details, then the sections.
 *
 * `origin` is the site's own, for the citation. `accessed` is the day the
 * page was rendered, which the citation names. `canEdit` gives an admin the
 * Edit button under the two actions.
 */
const LibraryArtifact = ({
    artifact,
    origin,
    accessed,
    canEdit = false,
}: {
    artifact: Artifact;
    origin: string;
    accessed: Date;
    canEdit?: boolean;
}) => {
    const studioHref =
        artifact.kind === 'data' ? `/data?share=${artifact.shareId}` : `/s/${artifact.shareId}`;
    const sections = [
        { id: 'artifact', label: 'Artifact' },
        ...(artifact.content
            ? [{ id: 'findings', label: artifact.contentTitle ?? 'Key Findings' }]
            : []),
        ...(artifact.steps.length > 0 ? [{ id: 'build-plan', label: 'Build Plan' }] : []),
        { id: 'sources', label: 'Sources' },
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
                        <iframe
                            className={classNames(
                                styles.frame,
                                artifact.kind === 'canvas' && styles.frameCanvas,
                            )}
                            src={`/embed/${artifact.shareId}`}
                            title={artifact.title}
                            loading="lazy"
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
                        {canEdit && <EditArtifact artifact={artifact} />}
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
                                    ? 'Showing latest data available from source'
                                    : `Showing data as published on ${publishedDate(artifact.publishedAt)}`}
                            </dd>
                        </div>
                        <div className={styles.fact}>
                            <dt>Published</dt>
                            <dd>{publishedDate(artifact.publishedAt)} by DFO Data</dd>
                        </div>
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

                    {artifact.steps.length > 0 && (
                        <section id="build-plan" className={styles.block}>
                            <h2 className={styles.heading}>Build Plan</h2>
                            <ol className={styles.steps}>
                                {artifact.steps.map((step, index) => (
                                    <li key={index} className={styles.step}>
                                        <span className={styles.stepIndex}>{pad(index)}</span>
                                        <div>
                                            <p className={styles.stepTitle}>{step.title}</p>
                                            {step.detail && (
                                                <p className={styles.stepDetail}>{step.detail}</p>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
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
                </div>
            </div>

            <PageFade />
        </section>
    );
};

export default LibraryArtifact;
