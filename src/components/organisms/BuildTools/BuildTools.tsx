'use client';

import { useRouter } from 'next/navigation';

import styles from './BuildTools.module.scss';

import Button from '@/components/atoms/Button/Button';
import SectionHeading from '@/components/molecules/SectionHeading/SectionHeading';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { docsSectionHref } from '@/lib/docs/nav';

// Python packages open the docs section holding oda_reader's pages, whatever
// its heading; the rest open the docs home.
const PACKAGES_HREF = docsSectionHref('oda_reader');

const boxes = [
    {
        title: 'REST API',
        text: 'Turn a plain-English question into a dataset in CSV, Excel, or Parquet, with its sources and citation. Look up names and codes.',
        href: '/docs',
    },
    {
        title: 'Python Packages',
        text: 'Load OECD, IMF, and TOSSD data into pandas straight from the publisher, with our open-source packages.',
        href: PACKAGES_HREF,
    },
    {
        title: 'MCP Server',
        text: 'Connect the DFO to Claude, ChatGPT, or Gemini. Your assistant answers from DFO data and names the source of each number.',
        href: '/docs',
    },
    {
        title: 'Embed Anywhere',
        text: 'Paste iframe code from Studio into any web page to show a whole canvas or a single chart, on live data or as a snapshot.',
        href: '/docs',
    },
];

const renderBox = (index: number, go: (href: string) => void) => {
    const { title, text, href } = boxes[index]!;

    return (
        <article className={styles.box} data-reveal-group="soft" data-button-zone>
            <h3 className={styles.boxTitle} data-reveal="text" style={revealIndex(0)}>
                {title}
            </h3>
            <p className={styles.boxText} data-reveal="text" style={revealIndex(1)}>
                {text}
            </p>
            <Button
                className={styles.boxButton}
                icon="arrow"
                aria-label={`Learn more about ${title}`}
                data-reveal
                style={revealIndex(2)}
                onClick={() => go(href)}
            />
        </article>
    );
};

const BuildTools = () => {
    const sectionRef = useReveal<HTMLElement>();
    const router = useRouter();
    const go = (href: string) => router.push(href);

    return (
        <section
            ref={sectionRef}
            className={styles.section}
            aria-labelledby="build-tools-title"
            data-nav-dark="true"
        >
            <div className={styles.grid}>
                <div className={styles.column}>
                    {renderBox(0, go)}
                    {renderBox(1, go)}
                </div>
                <div className={styles.column}>
                    {renderBox(2, go)}
                    {renderBox(3, go)}
                </div>
            </div>
            <SectionHeading
                id="build-tools-title"
                label="Build in Your Own Tools"
                title="Everything you need to connect, query, and ship with DFO data"
                className={styles.headingBlock}
            />
        </section>
    );
};

export default BuildTools;
