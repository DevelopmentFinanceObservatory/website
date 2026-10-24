'use client';

import Link from 'next/link';

import styles from './BuildTools.module.scss';

import Button from '@/components/atoms/Button/Button';
import SectionHeading from '@/components/molecules/SectionHeading/SectionHeading';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { docsPageHref, docsSectionHref } from '@/lib/docs/nav';

// Each box opens its docs page by corpus id, so a moved page keeps its link and
// a removed one fails the build. Python packages open the section holding
// oda_reader's pages, whatever its heading.
const boxes = [
    {
        title: 'REST API',
        text: 'Turn a plain-English question into a dataset in CSV, Excel, or Parquet, with its sources and citation. Look up names and codes.',
        href: docsPageHref('dfo-apis/quickstart'),
    },
    {
        title: 'Python Packages',
        text: 'Load OECD, IMF, and TOSSD data into pandas straight from the publisher, with our open-source packages.',
        href: docsSectionHref('oda_reader'),
    },
    {
        title: 'MCP Server',
        text: 'Connect the DFO to Claude, ChatGPT, or Gemini. Your assistant answers from DFO data and names the source of each number.',
        href: docsPageHref('dfo-ai/connect'),
    },
    {
        title: 'Embed Anywhere',
        text: 'Paste iframe code from Studio into any web page to show a whole canvas or a single chart, on live data or as a snapshot.',
        href: docsPageHref('hub/build/embed'),
    },
];

const renderBox = (index: number) => {
    const { title, text, href } = boxes[index]!;

    return (
        // The zone is the box: hovering anywhere on it flies the button's arrow
        // (see the Button atom), and the link fills it.
        <article className={styles.box} data-reveal-group="soft" data-button-zone>
            <Link href={href} className={styles.boxLink}>
                <h3 className={styles.boxTitle} data-reveal="text" style={revealIndex(0)}>
                    {title}
                </h3>
                <p className={styles.boxText} data-reveal="text" style={revealIndex(1)}>
                    {text}
                </p>
            </Link>
            {/* Beside the link, since an anchor cannot hold another one. The box
                is the link, so this copy stays out of the tab order and the
                accessibility tree. */}
            <Button
                href={href}
                className={styles.boxButton}
                icon="arrow"
                tabIndex={-1}
                aria-hidden
                data-reveal
                style={revealIndex(2)}
            />
        </article>
    );
};

const BuildTools = () => {
    const sectionRef = useReveal<HTMLElement>();

    return (
        <section
            ref={sectionRef}
            className={styles.section}
            aria-labelledby="build-tools-title"
            data-nav-dark="true"
        >
            <div className={styles.grid}>
                <div className={styles.column}>
                    {renderBox(0)}
                    {renderBox(1)}
                </div>
                <div className={styles.column}>
                    {renderBox(2)}
                    {renderBox(3)}
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
