/**
 * Download Image for a Studio card: the card as it stands on the canvas,
 * written to a PNG.
 *
 * Photographed, not drawn. The alternative was Chart.js's own
 * `toBase64Image()`, which gives the plot alone — no title, no source line,
 * no DFO mark. Everything else here ships its attribution with the data
 * (every dataset download carries its CITATION.cff), and a chart that
 * travels into a deck without its source is exactly the artefact that rule
 * exists to prevent. So the picture is the card, whole.
 *
 * The library loads on the first download rather than with the canvas: it
 * is a page's worth of code for something most readers never ask for.
 */

const DATA_ATTR = 'data-card-id';

/** The card's own element on the sheet, or null once it has been removed. */
export const cardNode = (id: string): HTMLElement | null =>
    document.querySelector<HTMLElement>(`[${DATA_ATTR}="${CSS.escape(id)}"] article`);

/** `kenya-gdp-per-capita-2026-10-08.png` — the card's title, as a file. */
export const cardImageName = (title: string, today = new Date()): string => {
    const slug =
        title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'card';

    return `${slug}-${today.toISOString().slice(0, 10)}.png`;
};

/**
 * Writes `node` to a PNG and hands it to the browser.
 *
 * At twice the screen's scale, so the file stands up in a slide rather than
 * only on the sheet it came from. The card's own controls are left out —
 * they are the canvas's furniture, not the card's content — and so is
 * anything else marked `data-no-export`.
 */
export const downloadCardImage = async (node: HTMLElement, name: string): Promise<void> => {
    const { toBlob } = await import('html-to-image');

    const blob = await toBlob(node, {
        pixelRatio: 2,
        // The card paints its own face; without this the PNG would carry
        // the sheet's grid showing through wherever the card is not opaque.
        backgroundColor: getComputedStyle(node).backgroundColor,
        filter: (child) =>
            !(child instanceof HTMLElement) || !child.hasAttribute('data-no-export'),
    });

    if (!blob) {
        throw new Error('The image could not be written.');
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = name;
    link.click();

    // The object URL holds the blob in memory until it is let go; the click
    // above has already handed the bytes over.
    URL.revokeObjectURL(url);
};
