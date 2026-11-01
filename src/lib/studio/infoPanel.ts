/**
 * Which view the More Info panel shows. A card that carries a description
 * renders it (`describedPanel`). A card without one, which covers cards
 * issued before descriptions existed, conversations saved with them and the
 * gallery's curated canvases, renders the legacy view from its `CardInfo`.
 */

import type { CardInfo, CardSource, Widget } from '../chat/widgets.ts';
import { readDescription, type Description } from './description.ts';
import {
    describedPanel,
    type LegacyView,
    type PanelBlock,
    type PanelOptions,
    type PanelView,
} from './descriptionBlocks.ts';
import { formatWindow } from './period.ts';
import { warnDescriptionRefused } from './payload.ts';
import type { ShareMint } from './shareDialog.ts';

// A `spec_` or `ops_` id names the card's own frame, a sum of indicators,
// which no reader can look up.
const isFrameId = (id: string): boolean => /^(dcid:)?(spec|ops)_/.test(id);

// The engine ships a machine string when it has no prose ("md=Count_Person,mp=amount,…").
const readable = (text: string): boolean => !!text && !/^[a-z_]+=/.test(text);

// The sources a legacy card cites: its list, or the one source a card saved
// before its sources were recorded kept.
const legacySources = (info: CardInfo): CardSource[] =>
    info.sources ??
    (info.sourceId && info.sourceName
        ? [
              {
                  id: info.sourceId,
                  name: info.sourceName,
                  licence: info.licence,
                  url: null,
                  retrieved: null,
              },
          ]
        : []);

/**
 * The legacy view: the citation, every source (whose graph name and link
 * the panel looks up by id on open), the years, indicator count, unit and
 * freshness, what the card's data leaves out, then each indicator a saved
 * card holds, with its id and description where a reader can use them.
 */
export const legacyPanel = (info: CardInfo): LegacyView => {
    const facts: PanelBlock = {
        key: 'facts',
        label: null,
        rows: [
            ...(info.years ? [{ label: 'Years', value: formatWindow(info.years) }] : []),
            { label: 'Indicators', value: String(info.indicatorCount) },
            ...(info.unit ? [{ label: 'Unit', value: info.unit }] : []),
            ...(info.dataThrough ? [{ label: 'Data through', value: info.dataThrough }] : []),
            ...(info.lastRefreshed ? [{ label: 'Last refreshed', value: info.lastRefreshed }] : []),
        ],
        items: [],
    };
    const leftOut: PanelBlock = {
        key: 'left_out',
        label: 'Left out',
        rows: [],
        items: info.leftOut ?? [],
    };

    return {
        kind: 'legacy',
        citation: info.citation ?? null,
        sources: legacySources(info).map((source) => ({
            key: source.id ?? source.name,
            name: source.name,
            url: source.url,
            page: null,
            meta: `${source.licence ?? 'Licence not stated'}${source.retrieved ? ` · retrieved ${source.retrieved}` : ''}`,
            lookup: source.id,
        })),
        blocks: leftOut.items.length > 0 ? [facts, leftOut] : [facts],
        indicators: (info.indicators ?? []).map((indicator) => ({
            key: indicator.id,
            name: indicator.name,
            id: isFrameId(indicator.id) ? null : indicator.id.replace(/^dcid:/, ''),
            description: readable(indicator.description) ? indicator.description : null,
        })),
    };
};

/** A card's stored description, read again as the panel and card face take
 *  it: a saved conversation, share or gallery card holds whatever JSON was
 *  saved. Undefined when the card has none or the reader refuses it, and the
 *  card shows the legacy view. */
export const cardDescription = (info: Pick<CardInfo, 'description'>): Description | undefined => {
    if (info.description === undefined) {
        return undefined;
    }

    const read = readDescription(info.description);

    return 'description' in read ? read.description : undefined;
};

/** Logs each saved card whose description the reader refuses, once per card
 *  revision. A conversation, share, embed or gallery canvas calls it as it
 *  loads: `cardDescription` falls back to the legacy view on every render
 *  without a word, so this is where the refusal is seen. */
export const logRefusedDescriptions = (widgets: readonly Widget[]): void => {
    const logged = new Set<string>();

    for (const widget of widgets) {
        if (widget.info?.description === undefined) {
            continue;
        }

        const read = readDescription(widget.info.description);
        const ref = 'ref' in widget ? widget.ref : undefined;
        const revision = ref ? `${ref.component_id}@${ref.revision}` : widget.id;

        if ('refused' in read && !logged.has(revision)) {
            logged.add(revision);
            warnDescriptionRefused(ref?.component_id, ref?.revision, read.refused);
        }
    }
};

/** The panel's view of a card: its description when it carries one the
 *  reader accepts, else the legacy view. */
export const panelViewOf = (info: CardInfo, options: PanelOptions): PanelView => {
    const description = cardDescription(info);

    return description ? describedPanel(description, options) : legacyPanel(info);
};

/** What asking for a snapshot link to cite came to: the snapshot share's
 *  id and the moment its data dates from when known, or why there is none.
 *  `limited` is a network that has made today's shares, which a second try
 *  today meets again; `failed` is anything else. */
export type CiteLink = { id: string; servedAt?: string } | { refusal: 'failed' | 'limited' };

/** The citation's snapshot link from the share made for it. */
export const citeLinkOf = (mint: ShareMint): CiteLink => {
    if ('id' in mint) {
        return mint.servedAt ? { id: mint.id, servedAt: mint.servedAt } : { id: mint.id };
    }

    return { refusal: mint.refusal.code === 'share_limit' ? 'limited' : 'failed' };
};

/** What a snapshot link made to cite a card is kept under for the session:
 *  the card's id, the component revision it draws and the frame version its
 *  data comes from. A card edited or drawn from new data since its link was
 *  made has another key, so it gets a link of its own. */
export const citeLinkKey = (widget: Widget): string => {
    const ref = 'ref' in widget ? widget.ref : undefined;
    const frame = 'frame' in widget ? widget.frame : undefined;

    return [
        widget.id,
        ref ? `${ref.component_id}@${ref.revision}` : '',
        frame ? `${frame.spec_id}@${frame.content_version}` : '',
    ].join('|');
};

/** Makes the snapshot link to cite the card kept under `key` (`citeLinkKey`),
 *  or hands back the one already being made for it. A second ask while the
 *  first is in flight, from the same panel or from More Info opened again,
 *  makes no second public share. Once the first settles, another ask makes a
 *  new one, which is how a failed link is tried again. A snapshot that could
 *  not be built or saved (`make` throws) settles as a failed link. */
export const citeLinkOnce = (
    inFlight: Map<string, Promise<CiteLink>>,
    key: string,
    make: () => Promise<CiteLink>,
): Promise<CiteLink> => {
    const running = inFlight.get(key);

    if (running) {
        return running;
    }

    const made = (async () => make())()
        .catch((error: unknown): CiteLink => {
            console.warn('Studio: a cite link could not be made', { key, error });

            return { refusal: 'failed' };
        })
        .finally(() => inFlight.delete(key));

    inFlight.set(key, made);

    return made;
};
