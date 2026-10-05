/**
 * Reads a request body as text, up to `maxBytes`. A chunked request declares
 * no length, so the count runs over the bytes as they arrive: past the cap
 * the stream is cancelled and the rest is never read. Resolves to null when
 * the body is over the cap, and to '' when there is no body.
 */
export const readBoundedText = async (
    body: ReadableStream<Uint8Array> | null,
    maxBytes: number,
): Promise<string | null> => {
    if (!body) {
        return '';
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = '';

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            return text + decoder.decode();
        }

        size += value.byteLength;

        if (size > maxBytes) {
            await reader.cancel();

            return null;
        }

        text += decoder.decode(value, { stream: true });
    }
};
