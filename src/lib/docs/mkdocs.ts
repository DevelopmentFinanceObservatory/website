/**
 * The corpus carries three dialects of block syntax our Markdown renderer
 * does not parse on its own. Rather than teach the parser each one, this
 * normalises them in the source, before parsing, into the two shapes the
 * renderer already understands:
 *
 * It also drops HTML comments, which the corpus uses for tooling notes
 * (`<!-- prettier-ignore -->`) and authors' TODOs. The renderer escapes raw
 * HTML rather than running it, so a comment left in place reads as body
 * text on the page.
 *
 *   !!! warning "Title"   (MkDocs admonition)  -> > [!WARNING] Title
 *   ??? note "Title"      (collapsible)        -> > [!NOTE] Title
 *   === "Label"           (Material tabs)      -> ::tab{label="Label"}
 *
 * The directive tabs the corpus already uses (`:::tabs` wrapping
 * `::tab{label="…"}`) pass through untouched and are picked up by the
 * remark plugin in Markdown.tsx.
 *
 * Both MkDocs forms indent their body four spaces past the marker, which
 * CommonMark would read as an indented code block, so the body is dedented
 * as it moves. Fenced regions are copied verbatim: a fence inside a body
 * keeps its own indentation relative to that body, and a marker that only
 * appears INSIDE a code sample is never rewritten.
 */

const ADMONITION = /^(\s*)(?:!!!|\?\?\?\+?|\?\?\?)\s+(\w+)(?:\s+"([^"]*)")?\s*$/;
const MATERIAL_TAB = /^(\s*)===\s+"([^"]*)"\s*$/;
const FENCE = /^\s*(```|~~~)/;

// GitHub's alert kinds — the only ones the renderer styles. Everything else
// MkDocs allows (info, example, quote, …) maps onto the nearest of these.
const KINDS: Record<string, string> = {
    note: 'NOTE',
    info: 'NOTE',
    abstract: 'NOTE',
    summary: 'NOTE',
    example: 'NOTE',
    quote: 'NOTE',
    tip: 'TIP',
    hint: 'TIP',
    success: 'TIP',
    check: 'TIP',
    question: 'IMPORTANT',
    important: 'IMPORTANT',
    warning: 'WARNING',
    attention: 'WARNING',
    caution: 'CAUTION',
    danger: 'CAUTION',
    failure: 'CAUTION',
    bug: 'CAUTION',
};

const indentOf = (line: string): number => line.length - line.trimStart().length;

/**
 * The lines belonging to a marker at `indent`: everything indented past it,
 * blank lines included, up to the first line that is neither. Returns the
 * body dedented by four spaces and the index after it.
 */
const bodyAfter = (lines: string[], from: number, indent: number): [string[], number] => {
    const body: string[] = [];
    let index = from;

    while (index < lines.length) {
        const line = lines[index]!;

        if (line.trim() === '') {
            body.push('');
            index += 1;
            continue;
        }

        if (indentOf(line) <= indent) {
            break;
        }

        body.push(line.slice(indent + 4));
        index += 1;
    }

    // A trailing blank belongs to the document, not to the block.
    while (body.length && body[body.length - 1] === '') {
        body.pop();
        index -= 1;
    }

    return [body, index];
};

export const normaliseMkdocs = (source: string): string => {
    const lines = source.split('\n');
    const out: string[] = [];
    let index = 0;
    let fenced = false;
    let commented = false;

    while (index < lines.length) {
        let line = lines[index]!;

        if (commented) {
            const close = line.indexOf('-->');

            if (close === -1) {
                index += 1;
                continue;
            }

            commented = false;
            line = line.slice(close + 3);

            if (!line.trim()) {
                index += 1;
                continue;
            }
        }

        if (!fenced && line.includes('<!--')) {
            const open = line.indexOf('<!--');
            const close = line.indexOf('-->', open + 4);
            const head = line.slice(0, open);

            if (close === -1) {
                commented = true;

                if (head.trim()) {
                    out.push(head.trimEnd());
                }

                index += 1;
                continue;
            }

            line = `${head}${line.slice(close + 3)}`;

            if (!line.trim()) {
                index += 1;
                continue;
            }
        }

        if (FENCE.test(line)) {
            fenced = !fenced;
            out.push(line);
            index += 1;
            continue;
        }

        if (fenced) {
            out.push(line);
            index += 1;
            continue;
        }

        const admonition = ADMONITION.exec(line);

        if (admonition) {
            const [, pad = '', rawKind = '', title] = admonition;
            const kind = KINDS[rawKind.toLowerCase()];

            if (kind) {
                const [body, next] = bodyAfter(lines, index + 1, pad.length);

                out.push(`${pad}> [!${kind}]${title ? ` ${title}` : ''}`);
                body.forEach((entry) => out.push(`${pad}>${entry ? ` ${entry}` : ''}`));
                index = next;
                continue;
            }
        }

        const tab = MATERIAL_TAB.exec(line);

        if (tab) {
            const [, pad = '', label = ''] = tab;
            const run: string[] = [];
            let cursor = index;

            // A run of sibling labels at the same indent is one tab set.
            while (cursor < lines.length) {
                const next = MATERIAL_TAB.exec(lines[cursor]!);

                if (!next || (next[1] ?? '').length !== pad.length) {
                    break;
                }

                const [body, after] = bodyAfter(lines, cursor + 1, pad.length);

                run.push(`${pad}::tab{label="${next[2]}"}`, '', ...body.map((entry) => pad + entry), '');
                cursor = after;

                while (cursor < lines.length && lines[cursor]!.trim() === '') {
                    cursor += 1;
                }
            }

            if (run.length) {
                out.push(`${pad}:::tabs`, '', ...run, `${pad}:::`, '');
                index = cursor;
                continue;
            }

            out.push(`${pad}::tab{label="${label}"}`);
            index += 1;
            continue;
        }

        out.push(line);
        index += 1;
    }

    return out.join('\n');
};
