'use client';

import { useEffect, useId, useRef, useState } from 'react';

import styles from './ArtifactEmbed.module.scss';
import EmbedFrame from './EmbedFrame';

import Button from '@/components/atoms/Button/Button';
import CodeBox from '@/components/molecules/CodeBox/CodeBox';
import {
    type EmbedFoot,
    embedFootAck,
    embedImageRequest,
    embedSnippet,
    hostEmbedPath,
    readEmbedFoot,
    readEmbedImageResult,
} from '@/lib/studio/embedHost';

type ImageState = 'idle' | 'writing' | 'written' | 'failed';

// How long the embed has to write the picture before Download image reports
// it failed, and how long the line saying it was written stays.
const IMAGE_TIMEOUT_MS = 20_000;
const WRITTEN_NOTICE_MS = 4_000;

// The frame's inner height, which the embed code gives the frame on another
// page while the embed has posted no height of its own. Zero until the frame
// has laid out.
const useFrameHeight = (frameRef: React.RefObject<HTMLIFrameElement | null>) => {
    const [height, setHeight] = useState(0);

    useEffect(() => {
        const frame = frameRef.current;

        if (!frame) {
            return undefined;
        }

        const observer = new ResizeObserver(() => setHeight(frame.clientHeight));

        observer.observe(frame);

        return () => observer.disconnect();
    }, [frameRef]);

    return height;
};

/**
 * A chart, table, key number or canvas artifact, drawn by its share's embed
 * with a bar under it. The bar says how recent a live artifact's data is,
 * the line the embed draws at its own foot on any other page. The embed
 * hides that line once this page answers its foot (lib/studio/embedHost).
 * Download image writes a card's PNG as Studio's card download does. A
 * canvas has no one card to photograph and offers none. Embed shows the code
 * that puts the share on another page, at its content's natural height plus
 * the embed's live strip.
 */
const ArtifactEmbed = ({
    shareId,
    title,
    canvas,
    className,
}: {
    shareId: string;
    title: string;
    canvas: boolean;
    className: string;
}) => {
    const frameRef = useRef<HTMLIFrameElement>(null);
    const [foot, setFoot] = useState<EmbedFoot | null>(null);
    const [image, setImage] = useState<ImageState>('idle');
    const [embedOpen, setEmbedOpen] = useState(false);
    const [origin, setOrigin] = useState('');
    const [contentHeight, setContentHeight] = useState<number | null>(null);
    const frameHeight = useFrameHeight(frameRef);
    const embedId = useId();

    useEffect(() => {
        if (image !== 'writing' && image !== 'written') {
            return undefined;
        }

        const timer = window.setTimeout(
            () => setImage(image === 'writing' ? 'failed' : 'idle'),
            image === 'writing' ? IMAGE_TIMEOUT_MS : WRITTEN_NOTICE_MS,
        );

        return () => window.clearTimeout(timer);
    }, [image]);

    const onMessage = (data: unknown) => {
        const next = readEmbedFoot(data);

        if (next) {
            setFoot(next);
            // A new foot comes from an embed that has started again and has
            // lost any request it held.
            setImage((state) => (state === 'writing' ? 'idle' : state));
            frameRef.current?.contentWindow?.postMessage(embedFootAck(), window.location.origin);

            return;
        }

        const written = readEmbedImageResult(data);

        if (written !== null) {
            setImage(written ? 'written' : 'failed');
        }
    };

    const downloadImage = () => {
        setImage('writing');
        frameRef.current?.contentWindow?.postMessage(embedImageRequest(), window.location.origin);
    };

    const toggleEmbed = () => {
        setOrigin(window.location.origin);
        setEmbedOpen((open) => !open);
    };

    const snippetHeight = (contentHeight ?? frameHeight) + (foot?.strip ?? 0);

    return (
        <>
            <EmbedFrame
                className={className}
                src={hostEmbedPath(shareId)}
                title={title}
                frameRef={frameRef}
                onHeight={setContentHeight}
                onMessage={onMessage}
                onLoad={() => setImage('idle')}
            />
            <div className={styles.bar}>
                <p className={styles.note}>
                    {foot?.note && (
                        <>
                            <span className={styles.dot} aria-hidden="true" />
                            {foot.note}
                        </>
                    )}
                </p>
                <div className={styles.actions}>
                    {!canvas && (
                        <Button
                            variant="bordered"
                            small
                            icon="download"
                            className={styles.action}
                            disabled={foot?.image !== true || image === 'writing'}
                            onClick={downloadImage}
                        >
                            {image === 'writing' ? 'Writing image' : 'Download image'}
                        </Button>
                    )}
                    <Button
                        variant="bordered"
                        small
                        icon="embed"
                        className={styles.action}
                        aria-expanded={embedOpen}
                        aria-controls={embedId}
                        onClick={toggleEmbed}
                    >
                        Embed
                    </Button>
                </div>
            </div>
            <p className={styles.status} role="status">
                {image === 'failed' && 'The image could not be written. Try again.'}
                {image === 'written' && 'Image downloaded.'}
            </p>
            <div id={embedId} className={styles.embed} hidden={!embedOpen}>
                <p className={styles.embedText}>
                    Paste this code into any page to show the {canvas ? 'canvas' : 'card'} there,
                    read-only.
                </p>
                {embedOpen && (
                    <CodeBox
                        value={embedSnippet({ origin, id: shareId, title, height: snippetHeight })}
                    />
                )}
            </div>
        </>
    );
};

export default ArtifactEmbed;
