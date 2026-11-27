import Link from 'next/link';

import styles from './LibraryArtifact.module.scss';
import SetReplacement from './SetReplacement';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import {
    artifactPath,
    libraryDate,
    type ReplacementChoice,
    type WithdrawnArtifact as Withdrawn,
} from '@/lib/library/artifact';

/**
 * What a withdrawn artifact's address shows: the day it was withdrawn, a
 * link to the artifact that replaced it when one is published, and a way
 * back to the Library. The artifact itself, its title, its actions, and its
 * text are erased. The address stays, so a citation to it leads somewhere
 * that says what happened. `replacements` gives an admin the form that
 * names or changes the replacement.
 */
const WithdrawnArtifact = ({
    artifact,
    replacements,
}: {
    artifact: Withdrawn;
    replacements?: readonly ReplacementChoice[];
}) => (
    <section className={styles.section}>
        <PageHero tone="dark" boxMinHeight={220}>
            <Link href="/library" prefetch={false} className={styles.back}>
                <span className={styles.backIcon} aria-hidden="true">
                    <Icon name="arrow" />
                </span>
                Library
            </Link>
            <h1 className={styles.title}>Withdrawn from the Library</h1>
            <p className={styles.lead}>
                This artifact was withdrawn from the Library on {libraryDate(artifact.withdrawnAt)}.
            </p>
        </PageHero>
        <div className={styles.withdrawn}>
            {artifact.replacement && (
                <p className={styles.replacedBy}>
                    Replaced by{' '}
                    <Link href={artifactPath(artifact.replacement.slug)} prefetch={false}>
                        {artifact.replacement.title}
                    </Link>
                </p>
            )}
            <Button href="/library" prefetch={false} variant="dark" icon="arrow">
                Browse the Library
            </Button>
            {replacements && (
                <SetReplacement
                    id={artifact.id}
                    replacedBy={artifact.replacedBy}
                    replacement={artifact.replacement}
                    choices={replacements}
                />
            )}
        </div>
        <PageFade />
    </section>
);

export default WithdrawnArtifact;
