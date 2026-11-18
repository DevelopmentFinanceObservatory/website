'use client';

import { useEffect, useState } from 'react';

import styles from './SectionRail.module.scss';

export type RailSection = { id: string; title: string };

/** How far down the window a section's top must pass before it counts as the one being read. */
const READ_LINE = 0.3;

/**
 * The id of the last section whose top has passed READ_LINE, or the first section's id
 * above them all. Re-read on scroll and resize, once a frame at most.
 */
const useCurrentSection = (ids: string[]): string | null => {
    const [current, setCurrent] = useState<string | null>(null);

    useEffect(() => {
        let frame = 0;

        const measure = () => {
            const line = window.innerHeight * READ_LINE;
            let next: string | null = ids[0] ?? null;

            for (const id of ids) {
                const element = document.getElementById(id);

                if (element !== null && element.getBoundingClientRect().top <= line) {
                    next = id;
                }
            }

            setCurrent(next);
        };
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        };

        measure();
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
        };
    }, [ids]);

    return current;
};

/**
 * A light list of the page's sections in the right margin, as the ONE Data story pages
 * have: it sticks below the header from 1100px and hides on narrower screens. The section
 * being read is underlined and carries `aria-current="location"`.
 */
export const SectionRail = ({ sections }: { sections: RailSection[] }) => {
    const current = useCurrentSection(sections.map(({ id }) => id));

    return (
        <nav aria-label="On this page" className={styles.rail}>
            <p aria-hidden="true" className={styles.label}>
                On this page
            </p>
            <ol className={styles.list}>
                {sections.map(({ id, title }) => (
                    <li key={id}>
                        <a
                            href={`#${id}`}
                            className={styles.link}
                            aria-current={id === current ? 'location' : undefined}
                        >
                            {title}
                        </a>
                    </li>
                ))}
            </ol>
        </nav>
    );
};
