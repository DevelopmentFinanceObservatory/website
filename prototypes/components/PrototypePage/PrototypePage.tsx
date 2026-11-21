import Link from 'next/link';
import type { ReactNode } from 'react';

import proseStyles from '../Prose/Prose.module.scss';
import { SectionRail, type RailSection } from '../SectionRail/SectionRail';
import styles from './PrototypePage.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import PageHero from '@/components/molecules/PageHero/PageHero';

/**
 * A prototype page with the site's page opening: the light hero, as on Docs and the
 * policy pages, holding a link back to the index, the title and a one-sentence lede.
 * The MDX body follows at the site's content width or, given `sections`, in a narrower
 * column with a SectionRail listing them in the right margin. A page whose section titles
 * come from client state passes its own rail as `rail` instead. A page.mdx uses it as its
 * layout (`export default`), which replaces the plain prose wrapper of mdx-components.tsx.
 */
export const PrototypePage = ({
    title,
    lede,
    sections,
    rail,
    children,
}: {
    title: string;
    /** One sentence; may hold links. */
    lede: ReactNode;
    /** The page's sections, by element id, for the rail. */
    sections?: RailSection[];
    /** A rail to show in place of the SectionRail of `sections`. */
    rail?: ReactNode;
    children: ReactNode;
}) => {
    const aside =
        rail ?? (sections === undefined ? undefined : <SectionRail sections={sections} />);

    return (
        <>
            <PageHero tone="light" boxMinHeight={200} className={styles.hero}>
                <Link href="/" className={styles.back}>
                    <Icon name="arrow" className={styles.backIcon} />
                    Prototypes
                </Link>
                <h1 className={styles.title}>{title}</h1>
                <p className={styles.lede}>{lede}</p>
            </PageHero>
            {aside === undefined ? (
                <div className={`${proseStyles.prose} ${styles.body}`}>{children}</div>
            ) : (
                <div className={`${proseStyles.prose} ${styles.body} ${styles.withRail}`}>
                    <div className={styles.main}>{children}</div>
                    <aside className={styles.aside}>{aside}</aside>
                </div>
            )}
        </>
    );
};
