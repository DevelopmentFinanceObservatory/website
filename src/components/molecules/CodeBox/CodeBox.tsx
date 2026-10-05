'use client';

import classNames from 'classnames';
import { useEffect, useState } from 'react';

import styles from './CodeBox.module.scss';

import Icon from '@/components/atoms/Icon/Icon';

export type CodeBoxProps = {
    value: string;
    // A quiet trailing link ("View Docs") left of the Copy square.
    link?: { label: string; href: string };
    // Mono by default; `mono={false}` for prose-like values (citations).
    mono?: boolean;
    className?: string;
};

/**
 * A code / URL box: mono text on white with a hairline, a Copy square (and
 * an optional trailing link) at right. Used by the source pages.
 */
const CodeBox = ({ value, link, mono = true, className }: CodeBoxProps) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) {
            return;
        }

        const timer = window.setTimeout(() => setCopied(false), 1400);

        return () => window.clearTimeout(timer);
    }, [copied]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
        } catch {
            // Clipboard blocked — the text is selectable.
        }
    };

    return (
        <div className={classNames(styles.codeBox, className)}>
            <pre className={classNames(styles.code, !mono && styles.codeSans)}>{value}</pre>
            <div className={styles.codeActions}>
                {link && (
                    <a className={styles.codeLink} href={link.href}>
                        {link.label}
                    </a>
                )}
                <button
                    type="button"
                    className={classNames(styles.copy, copied && styles.copied)}
                    onClick={copy}
                    aria-label={copied ? 'Copied' : 'Copy'}
                >
                    <Icon name={copied ? 'check' : 'copy'} />
                </button>
            </div>
        </div>
    );
};

export default CodeBox;
