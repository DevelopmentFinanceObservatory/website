import { useId } from 'react';

import styles from './SheetSection.module.scss';

/** One numbered step of a sheet screen: a heading and what the step holds. */
const SheetSection = ({ title, children }: { title: string; children: React.ReactNode }) => {
    const id = useId();
    return (
        <section className={styles.section} aria-labelledby={id}>
            <h2 id={id} className={styles.heading}>
                {title}
            </h2>
            {children}
        </section>
    );
};

export default SheetSection;
