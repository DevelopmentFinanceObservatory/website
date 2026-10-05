'use client';

import { Children, isValidElement, useState, type ReactElement, type ReactNode } from 'react';

import styles from './Docs.module.scss';

type Panel = ReactElement<{ 'data-label'?: string }>;

/** A tab set in a docs page: one panel visible, the rest a click away. The
 *  panels arrive already rendered, each carrying its own label on the
 *  element — see the `docs-tab` component in Markdown.tsx. */
const DocsTabs = ({ children }: { children?: ReactNode }) => {
    const panels = Children.toArray(children).filter((child): child is Panel =>
        isValidElement(child),
    );
    const [active, setActive] = useState(0);

    if (panels.length === 0) {
        return null;
    }

    const current = Math.min(active, panels.length - 1);

    return (
        <div className={styles.tabs}>
            <div className={styles.tabList} role="tablist">
                {panels.map((panel, index) => (
                    <button
                        key={panel.props['data-label'] ?? index}
                        type="button"
                        role="tab"
                        aria-selected={index === current}
                        className={styles.tab}
                        data-active={index === current || undefined}
                        onClick={() => setActive(index)}
                    >
                        {panel.props['data-label'] ?? `Option ${index + 1}`}
                    </button>
                ))}
            </div>
            {panels.map((panel, index) => (
                <div
                    key={panel.props['data-label'] ?? index}
                    className={styles.tabPanel}
                    role="tabpanel"
                    hidden={index !== current}
                >
                    {panel}
                </div>
            ))}
        </div>
    );
};

export default DocsTabs;
