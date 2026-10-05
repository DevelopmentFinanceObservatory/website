'use client';

import { useRef } from 'react';

import styles from './SectionHeading.module.scss';

import TextFill, { fillSpan } from '@/components/atoms/TextFill/TextFill';
import { useFillProgress } from '@/hooks/useFillProgress';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export type SectionHeadingProps = {
    label: string;
    title: string;
    id?: string;
    className?: string;
};

// Label and title fill as ONE continuous progression, driven from the wrapper.
const SectionHeading = ({ label, title, id, className }: SectionHeadingProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const reducedMotion = usePrefersReducedMotion();
    const labelWords = label.split(' ').length;
    const totalWords = labelWords + title.split(' ').length;

    useFillProgress(ref, !reducedMotion);

    return (
        <div
            ref={ref}
            className={className}
            style={{ '--fill-span': fillSpan(totalWords) } as React.CSSProperties}
        >
            <p className={styles.label}>
                <TextFill driven={false} text={label} total={totalWords} />
            </p>
            <h2 id={id} className={styles.heading}>
                <TextFill driven={false} text={title} offset={labelWords} total={totalWords} />
            </h2>
        </div>
    );
};

export default SectionHeading;
