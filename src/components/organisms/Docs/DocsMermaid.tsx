'use client';

import { useEffect, useId, useState } from 'react';

import styles from './Docs.module.scss';

/**
 * A `mermaid` fence, drawn (QA-11).
 *
 * Mermaid measures the text it lays out, so it needs a real browser —
 * rendering it at build the way the syntax colours are rendered would mean
 * running Chromium in CI for the one diagram the corpus has. So it draws on
 * the client instead, and the library is imported only once a diagram is
 * actually on the page: every other docs page pays nothing for it.
 *
 * Until it has drawn (and if it cannot), the source stays on the page as a
 * code block. A diagram whose syntax the corpus got wrong should look like
 * a mistake, not like a blank space.
 */
const DocsMermaid = ({ source }: { source: string }) => {
    const [svg, setSvg] = useState('');
    // One id per instance: mermaid puts it on the <svg> and on every marker
    // it defines, and two diagrams sharing an id share their arrowheads.
    // React's own id carries punctuation that is not valid in the `#id`
    // selectors mermaid writes, so only the word characters survive.
    const id = `mermaid-${useId().replace(/\W/g, '')}`;

    useEffect(() => {
        let live = true;

        void (async () => {
            const { default: mermaid } = await import('mermaid');

            mermaid.initialize({
                startOnLoad: false,
                securityLevel: 'strict',
                fontFamily: 'var(--font-outfit), sans-serif',
                theme: 'base',
                // The house palette: a white node on a sage outline, charcoal
                // text, stone edges. Mermaid derives the rest from these.
                themeVariables: {
                    background: '#f7f7ee',
                    primaryColor: '#ffffff',
                    primaryBorderColor: '#e0e0c7',
                    primaryTextColor: '#484842',
                    lineColor: '#5e5e52',
                    secondaryColor: '#ececdb',
                    tertiaryColor: '#f7f7ee',
                    fontSize: '14px',
                },
            });

            try {
                const drawn = await mermaid.render(id, source);

                if (live) {
                    setSvg(drawn.svg);
                }
            } catch {
                // Left as the source block below.
            }
        })();

        return () => {
            live = false;
        };
    }, [id, source]);

    if (!svg) {
        return (
            <figure className={styles.code}>
                <pre>
                    <code>{source}</code>
                </pre>
            </figure>
        );
    }

    return (
        <figure
            className={styles.diagram}
            // mermaid's own output, from markdown we ship ourselves, with
            // the library's `strict` sanitiser over the labels on top.
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
};

export default DocsMermaid;
