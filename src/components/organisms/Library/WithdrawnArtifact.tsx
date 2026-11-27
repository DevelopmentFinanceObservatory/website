import Link from 'next/link';

import styles from './LibraryArtifact.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import {
    kindLabel,
    publishedDate,
    type WithdrawnArtifact as Withdrawn,
} from '@/lib/library/artifact';

/**
 * What a withdrawn artifact's address shows: its title, the day it was
 * withdrawn and a way back to the Library. The artifact itself, its actions
 * and its text are gone; the address stays so a citation to it still leads
 * somewhere that says what happened.
 */
const WithdrawnArtifact = ({ artifact }: { artifact: Withdrawn }) => (
    <section className={styles.section}>
        <PageHero tone="dark" boxMinHeight={220}>
            <Link href="/library" prefetch={false} className={styles.back}>
                <span className={styles.backIcon} aria-hidden="true">
                    <Icon name="arrow" />
                </span>
                Library
            </Link>
            <h1 className={styles.title}>{artifact.title}</h1>
            <p className={styles.lead}>
                This {kindLabel(artifact.kind).toLowerCase()} was withdrawn from the Library on{' '}
                {publishedDate(artifact.withdrawnAt)}.
            </p>
        </PageHero>
        <div className={styles.withdrawn}>
            <Button href="/library" prefetch={false} variant="dark" icon="arrow">
                Browse the Library
            </Button>
        </div>
        <PageFade />
    </section>
);

export default WithdrawnArtifact;
