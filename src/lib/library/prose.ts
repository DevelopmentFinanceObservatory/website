/**
 * The publisher's text as blocks. Blank lines split paragraphs. Inside one,
 * a run of lines starting "- " or "• " is a list, and the other lines are a
 * paragraph whose single line breaks stay line breaks.
 */

export type ProseBlock = { type: 'paragraph'; lines: string[] } | { type: 'list'; items: string[] };

const BULLET = /^\s*[-•]\s+/;

export const parseProse = (text: string): ProseBlock[] => {
    const blocks: ProseBlock[] = [];

    for (const chunk of text.split(/\n\s*\n/)) {
        // The block the chunk's lines are adding to; a chunk starts a new one.
        let current: ProseBlock | null = null;

        for (const line of chunk.split('\n').map((raw) => raw.trim())) {
            if (line === '') {
                continue;
            }

            if (BULLET.test(line)) {
                const item = line.replace(BULLET, '');

                if (current?.type === 'list') {
                    current.items.push(item);
                } else {
                    current = { type: 'list', items: [item] };
                    blocks.push(current);
                }
            } else if (current?.type === 'paragraph') {
                current.lines.push(line);
            } else {
                current = { type: 'paragraph', lines: [line] };
                blocks.push(current);
            }
        }
    }

    return blocks;
};
