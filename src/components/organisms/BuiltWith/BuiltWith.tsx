'use client';

import classNames from 'classnames';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';

import styles from './BuiltWith.module.scss';

import Button from '@/components/atoms/Button/Button';
import { useInView } from '@/hooks/useInView';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { useScrollFrame } from '@/hooks/useScrollFrame';
import { centeredProgress, isDesktopViewport } from '@/utils/scroll';

const CARD_PARALLAX = [180, 300, 110];
// Negative: the watermark starts high (visible first) and slides DOWN with the scroll.
const WATERMARK_PARALLAX = -220;

const projects = [
    {
        id: 1,
        image: '/images/cases/case-1.png',
        org: 'Center for Global Development',
        orgMeta: 'Think Tank | Washington, DC',
        title: 'Debt Sustainability Monitor',
        text: 'An AI-assisted research tool that lets analysts query debt sustainability trends across low-income countries via natural language, powered by an MCP integration with Claude.',
    },
    {
        id: 2,
        image: '/images/cases/case-2.png',
        org: 'Center for Global Development',
        orgMeta: 'Think Tank | Washington, DC',
        title: 'Debt Sustainability Monitor',
        text: 'An AI-assisted research tool that lets analysts query debt sustainability trends across low-income countries via natural language, powered by an MCP integration with Claude.',
    },
    {
        id: 3,
        image: '/images/cases/case-3.png',
        org: 'Center for Global Development',
        orgMeta: 'Think Tank | Washington, DC',
        title: 'Debt Sustainability Monitor',
        text: 'An AI-assisted research tool that lets analysts query debt sustainability trends across low-income countries via natural language, powered by an MCP integration with Claude.',
    },
];

const BuiltWith = () => {
    const router = useRouter();
    const sectionRef = useReveal<HTMLElement>();
    const watermarkRef = useRef<HTMLParagraphElement>(null);
    const cardRefs = useRef<(HTMLElement | null)[]>([]);
    const reducedMotion = usePrefersReducedMotion();

    // The watermark is physically below the first card, but it must show up FIRST —
    // it rides the section's entry instead of its own viewport position.
    const watermarkIn = useInView(sectionRef);

    const parallax = useCallback(() => {
        const section = sectionRef.current;

        if (!section) {
            return;
        }

        if (!isDesktopViewport()) {
            watermarkRef.current?.style.removeProperty('transform');
            cardRefs.current.forEach((card) => card?.style.removeProperty('transform'));

            return;
        }

        const progress = centeredProgress(section.getBoundingClientRect(), window.innerHeight);

        if (watermarkRef.current) {
            watermarkRef.current.style.transform = `translateY(${progress * WATERMARK_PARALLAX}px)`;
        }

        cardRefs.current.forEach((card, index) => {
            if (card) {
                card.style.transform = `translateY(${progress * CARD_PARALLAX[index]!}px)`;
            }
        });
    }, [sectionRef]);

    useScrollFrame(reducedMotion ? null : parallax);

    return (
        <section ref={sectionRef} className={styles.section} aria-labelledby="built-with-title">
            <p id="built-with-title" className={styles.title} data-reveal="text">
                Get inspired by what others are building
            </p>
            <div className={styles.cards}>
                <p
                    ref={watermarkRef}
                    className={classNames(styles.watermark, watermarkIn && styles.watermarkIn)}
                    aria-hidden="true"
                >
                    Built with
                    <br />
                    DFO
                </p>
                {projects.map(({ id, image, org, orgMeta, title, text }) => (
                    <article
                        key={id}
                        ref={(node) => {
                            cardRefs.current[id - 1] = node;
                        }}
                        className={styles.card}
                        data-card={id}
                        data-reveal-group
                        data-button-zone
                    >
                        <Image
                            className={styles.cover}
                            src={image}
                            alt=""
                            width={380}
                            height={215}
                        />
                        <div className={styles.body}>
                            <div className={styles.meta} data-reveal style={revealIndex(0)}>
                                <span className={styles.chip} aria-hidden="true">
                                    CGD
                                </span>
                                <div>
                                    <p className={styles.org}>{org}</p>
                                    <p className={styles.orgMeta}>{orgMeta}</p>
                                </div>
                            </div>
                            <h3
                                className={styles.cardTitle}
                                data-reveal="text"
                                style={revealIndex(1)}
                            >
                                {title}
                            </h3>
                            <p
                                className={styles.cardText}
                                data-reveal="text"
                                style={revealIndex(2)}
                            >
                                {text}
                            </p>
                            <Button
                                className={styles.visit}
                                variant="dark"
                                icon="arrow-up-right"
                                data-reveal
                                style={revealIndex(3)}
                            >
                                Visit Project
                            </Button>
                        </div>
                    </article>
                ))}
            </div>
            <div className={styles.footer}>
                <Button
                    variant="dark"
                    data-reveal
                    onClick={() => router.push('/insights/publications')}
                >
                    View All
                </Button>
            </div>
        </section>
    );
};

export default BuiltWith;
