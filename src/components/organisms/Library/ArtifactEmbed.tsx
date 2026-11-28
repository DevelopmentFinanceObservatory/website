'use client';

import { useEffect, useId, useRef, useState } from 'react';

import styles from './ArtifactEmbed.module.scss';
import EmbedFrame from './EmbedFrame';

import Button from '@/components/atoms/Button/Button';
import CodeBox from '@/components/molecules/CodeBox/CodeBox';
import {
    EMBED_LIVE_STRIP,
    type EmbedFoot,
    embedImageRequest,
    embedSnippet,
    hostEmbedPath,
    readEmbedFoot,
    readEmbedImageResult,
} from '@/lib/studio/embedHost';

type ImageState = 'idle' | 'writing' | 'failed';

// The frame's inner height, which the embed code gives the frame on another
// page. Zero until the frame has laid out.
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
 * A chart, table, key number or canvas artifact: its share's embed, then the
 * bar under it. The bar says how recent a live artifact's data is, the line
 * the embed draws at its own foot on any other page (lib/studio/embedHost).
 * Download image writes a card's PNG as Studio's card download does; a
 * canvas has no one card to photograph and offers none. Embed shows the code
 * that puts the share on another page, at the height the frame shows here.
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
    const frameHeight = useFrameHeight(frameRef);
    const embedId = useId();

    const onMessage = (data: unknown) => {
        const next = readEmbedFoot(data);

        if (next) {
            setFoot(next);

            return;
        }

        const written = readEmbedImageResult(data);

        if (written !== null) {
            setImage(written ? 'idle' : 'failed');
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

    const snippetHeight = frameHeight + (foot?.note ? EMBED_LIVE_STRIP : 0);

    return (
        <>
            <EmbedFrame
                className={className}
                src={hostEmbedPath(shareId)}
                title={title}
                frameRef={frameRef}
                onMessage={onMessage}
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
                {image === 'failed' ? 'The image could not be written. Try again.' : null}
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
