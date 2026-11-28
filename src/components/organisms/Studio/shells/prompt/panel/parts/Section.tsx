import classNames from 'classnames';
import { type ReactNode, useId } from 'react';

import styles from './parts.module.scss';

type SectionProps = {
    /** The heading's content: words, or a Fold that is the heading. A foot
     *  section of a page's own actions may go without one. */
    label?: ReactNode;
    count?: number | string | null;
    /** A control at the head's right, such as `Copy citations`. */
    action?: ReactNode;
    /** A foot section lays its children out as a wrapping row. */
    foot?: boolean;
    className?: string;
    children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'>;

/** A titled section of the panel, labelled by its heading. Successive
 *  sections are divided by a hairline. */
export const Section = ({
    label,
    count,
    action,
    foot = false,
    className,
    children,
    ...rest
}: SectionProps) => {
    const id = useId();

    return (
        <section
            aria-labelledby={label ? id : undefined}
            className={classNames(styles.section, foot && styles.foot, className)}
            {...rest}
        >
            {label && (
                <div className={styles.head}>
                    <h3 id={id} className={styles.label}>
                        {label}
                        {count !== undefined && count !== null && count !== '' && (
                            <span className={styles.count}>{count}</span>
                        )}
                    </h3>
                    {action}
                </div>
            )}
            {children}
        </section>
    );
};
