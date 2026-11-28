'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { clampEmbedHeight, embedHeightRequest, readEmbedHeight } from '@/lib/studio/embedHeight';

/**
 * An artifact's share embed, which takes the height its content asks for
 * (lib/studio/embedHeight). The frame's class sets its starting height, which
 * stays in force until a message arrives and is the floor after one. Only a
 * message from this frame's own window, served from this site's origin,
 * counts. The frame asks for the height when it mounts and when it loads, so
 * a height the embed posted before this page hydrated still arrives.
 * `onHeight` gets each height the embed asks for, before the range is
 * applied, `onMessage` every other message from the frame, and `onLoad` each
 * load of the frame. `frameRef`, when given, holds the frame for the caller.
 */
const EmbedFrame = ({
    src,
    title,
    className,
    frameRef,
    onHeight,
    onMessage,
    onLoad,
}: {
    src: string;
    title: string;
    className: string;
    frameRef?: React.RefObject<HTMLIFrameElement | null>;
    onHeight?: (height: number) => void;
    onMessage?: (data: unknown) => void;
    onLoad?: () => void;
}) => {
    const ownRef = useRef<HTMLIFrameElement>(null);
    const ref = frameRef ?? ownRef;
    const passOn = useEffectEvent((data: unknown) => onMessage?.(data));
    const passHeight = useEffectEvent((height: number) => onHeight?.(height));
    const [height, setHeight] = useState<number | null>(null);
    const askHeight = () =>
        ref.current?.contentWindow?.postMessage(embedHeightRequest(), window.location.origin);

    useEffect(() => {
        const onFrameMessage = (event: MessageEvent) => {
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
                passHeight(requested);
            } else {
                passOn(event.data);
            }
        };

        window.addEventListener('message', onFrameMessage);
        ref.current?.contentWindow?.postMessage(embedHeightRequest(), window.location.origin);

        return () => window.removeEventListener('message', onFrameMessage);
    }, [ref]);

    return (
        <iframe
            ref={ref}
            className={className}
            src={src}
            title={title}
            loading="lazy"
            onLoad={() => {
                askHeight();
                onLoad?.();
            }}
            style={
                height === null
                    ? undefined
                    : ({ '--embed-fit': `${height}px` } as React.CSSProperties)
            }
        />
    );
};

export default EmbedFrame;
