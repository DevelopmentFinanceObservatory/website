'use client';

import classNames from 'classnames';
import { useEffect, useState } from 'react';

import styles from './LibraryArtifact.module.scss';

type Section = { id: string; label: string };

/**
 * The page's sections, the one being read marked: the last whose top has
 * passed the band under the header.
 */
const ArtifactToc = ({ sections }: { sections: readonly Section[] }) => {
    const [current, setCurrent] = useState<string | undefined>(sections[0]?.id);

    useEffect(() => {
        const read = () => {
            const passed = sections.filter(
                (section) =>
                    (document.getElementById(section.id)?.getBoundingClientRect().top ??
                        Infinity) <=
                    window.innerHeight * 0.3,
            );
            const atEnd =
                window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

            setCurrent(atEnd ? sections.at(-1)?.id : (passed.at(-1)?.id ?? sections[0]?.id));
        };

        read();
        window.addEventListener('scroll', read, { passive: true });
        window.addEventListener('resize', read);

        return () => {
            window.removeEventListener('scroll', read);
            window.removeEventListener('resize', read);
        };
    }, [sections]);

    return (
        <nav className={styles.toc} aria-label="On this page">
            <ul>
                {sections.map((section) => (
                    <li key={section.id}>
                        <a
                            href={`#${section.id}`}
                            className={classNames(section.id === current && styles.tocCurrent)}
                            aria-current={section.id === current ? 'location' : undefined}
                        >
                            {section.label}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
};

export default ArtifactToc;
