'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './ApiKeysPanel.module.scss';

import Button from '@/components/atoms/Button/Button';

const COPIED_MS = 2000;

type RevealedKeyProps = {
    secret: string;
    onClose: () => void;
};

/** The one view of a new key: selectable, with a Copy button. */
const RevealedKey = ({ secret, onClose }: RevealedKeyProps) => {
    const [copied, setCopied] = useState(false);
    const [failed, setFailed] = useState(false);
    const block = useRef<HTMLElement>(null);
    const timer = useRef(0);

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(secret);
            setFailed(false);
            setCopied(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
        } catch {
            // No clipboard access (an insecure page, a denied permission): select the key to copy by hand.
            setFailed(true);
            window.getSelection()?.selectAllChildren(block.current as Node);
        }
    };

    return (
        <div className={styles.form}>
            <p className={styles.copy}>Copy your key now. It won&apos;t be shown again.</p>
            <code ref={block} className={styles.secret}>
                {secret}
            </code>
            {failed && (
                <p className={styles.muted} role="status">
                    Copying failed. The key is selected, so copy it with your keyboard.
                </p>
            )}
            <div className={styles.actions}>
                <Button small variant="paper" onClick={copy}>
                    {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button small variant="dark" onClick={onClose}>
                    Close
                </Button>
            </div>
        </div>
    );
};

export default RevealedKey;
