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
 * A copy of `node` to photograph, beside it in the same slot so it takes
 * the same styles. The live note stops at a capped height and scrolls; the
 * copy's `data-export` lifts the cap (CardChrome.module.scss), and the copy
 * grows by the lines that uncovers so the body above keeps its size. It is
 * clipped out of sight and out of the slot's layout. html-to-image inlines
 * each element's computed style and has no hook on its clone, so the card
 * on the sheet stays untouched only by photographing a separate element.
 */
const exportCopy = (node: HTMLElement): HTMLElement => {
    const copy = node.cloneNode(true) as HTMLElement;

    // The live card keeps the ids; a duplicate would answer its lookups.
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    copy.setAttribute('data-export', '');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    Object.assign(copy.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: `${node.offsetWidth}px`,
        height: `${node.offsetHeight}px`,
        // The card's entrance animation would replay from transparent.
        animation: 'none',
        transition: 'none',
        clipPath: 'inset(50%)',
        pointerEvents: 'none',
    });
    node.after(copy);

    // cloneNode copies a canvas's size, not what is drawn on it.
    const canvases = node.querySelectorAll('canvas');

    copy.querySelectorAll('canvas').forEach((canvas, index) => {
        canvas.getContext('2d')?.drawImage(canvases[index], 0, 0);
    });

    // The notes that scroll on the sheet (CardChrome's NoteLine), measured
    // in full in the copy.
    const liveNotes = node.querySelectorAll<HTMLElement>('[data-no-drag]');
    let hidden = 0;

    copy.querySelectorAll<HTMLElement>('[data-no-drag]').forEach((note, index) => {
        hidden += Math.max(0, note.offsetHeight - liveNotes[index].offsetHeight);
    });
    copy.style.height = `${node.offsetHeight + hidden}px`;

    return copy;
};

/**
 * Writes `node` to a PNG and hands it to the browser.
 *
 * At twice the screen's scale, so the file stands up in a slide rather than
 * only on the sheet it came from. The card's own controls are left out —
 * they are the canvas's furniture, not the card's content — and so is
 * anything else marked `data-no-export`. A note is written in full, however
 * far it scrolls on the sheet.
 */
export const downloadCardImage = async (node: HTMLElement, name: string): Promise<void> => {
    const { toBlob } = await import('html-to-image');
    const copy = exportCopy(node);
    let blob: Blob | null;

    try {
        blob = await toBlob(copy, {
            pixelRatio: 2,
            // The card paints its own face; without this the PNG would carry
            // the sheet's grid showing through wherever the card is not opaque.
            backgroundColor: getComputedStyle(node).backgroundColor,
            style: { clipPath: 'none' },
            filter: (child) =>
                !(child instanceof HTMLElement) || !child.hasAttribute('data-no-export'),
        });
    } finally {
        copy.remove();
    }

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
