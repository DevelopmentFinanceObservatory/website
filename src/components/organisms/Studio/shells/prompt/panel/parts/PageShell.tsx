import type { ReactNode } from 'react';

import { usePanelNav } from '../panelNav';
import { Chevron } from './Glyphs';
import styles from './parts.module.scss';

import type { PanelPage } from '@/lib/studio/promptShell';

type PageShellProps = {
    kind: PanelPage['kind'];
    title: ReactNode;
    /** The line under the title: words, or a block such as the card page's
     *  origin. */
    meta?: ReactNode;
    /** The page's sections, each divided from the last by a hairline. */
    children?: ReactNode;
};

/**
 * A page of the session panel: the back row pinned to the top of the
 * panel's scroller, with a hairline under it, the title, the meta line and
 * the sections.
 */
export const PageShell = ({ kind, title, meta, children }: PageShellProps) => {
    const { back, backLabel, topSpacer } = usePanelNav();

    return (
        <div className={styles.page} data-sp-page={kind}>
            <div className={styles.backRow} data-sp-backrow>
                <button
                    type="button"
                    className={styles.back}
                    title={backLabel}
                    data-sp-back
                    data-sp-key="back"
                    onClick={back}
                >
                    <Chevron direction="left" />
                    <span className={styles.backLabel}>{backLabel}</span>
                </button>
            </div>
            <div ref={topSpacer} className={styles.spacer} aria-hidden="true" data-end="top" />
            <h2 className={styles.title}>{title}</h2>
            {typeof meta === 'string' ? <p className={styles.meta}>{meta}</p> : meta}
            {children}
        </div>
    );
};

/** A paragraph of page text, inset to the rows' edge. */
export const PageText = ({
    children,
    strong = false,
}: {
    children: ReactNode;
    strong?: boolean;
}) => <p className={strong ? `${styles.text} ${styles.strong}` : styles.text}>{children}</p>;
