'use client';

import { useEffect, useRef, useState } from 'react';

import { clampEmbedHeight, embedHeightRequest, readEmbedHeight } from '@/lib/studio/embedHeight';

/**
 * An artifact's share embed, which takes the height its content asks for
 * (lib/studio/embedHeight). The frame's class sets its starting height, which
 * stays in force until a message arrives and is the floor after one. Only a
 * message from this frame's own window, served from this site's origin,
 * counts. The frame asks for the height when it mounts and when it loads, so
 * a height the embed posted before this page hydrated still arrives.
 */
const EmbedFrame = ({
    src,
    title,
    className,
}: {
    src: string;
    title: string;
    className: string;
}) => {
    const ref = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState<number | null>(null);
    const askHeight = () =>
        ref.current?.contentWindow?.postMessage(embedHeightRequest(), window.location.origin);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (
                event.origin !== window.location.origin ||
                event.source === null ||
                event.source !== ref.current?.contentWindow
            ) {
                return;
            }

            const requested = readEmbedHeight(event.data);
            const frame = ref.current;

            // The embed measures its viewport, inside the frame's border.
            if (requested !== null) {
                setHeight(clampEmbedHeight(requested) + frame.offsetHeight - frame.clientHeight);
            }
        };

        window.addEventListener('message', onMessage);
        askHeight();

        return () => window.removeEventListener('message', onMessage);
    }, []);

    return (
        <iframe
            ref={ref}
            className={className}
            src={src}
            title={title}
            loading="lazy"
            onLoad={askHeight}
            style={
                height === null
                    ? undefined
                    : ({ '--embed-fit': `${height}px` } as React.CSSProperties)
            }
        />
    );
};

export default EmbedFrame;
