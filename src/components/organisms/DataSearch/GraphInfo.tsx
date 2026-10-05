'use client';

import {
    use,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './DataSearch.module.scss';
import { OptionRowInfo } from './SlotMenu';

import Icon from '@/components/atoms/Icon/Icon';
import { graphReader } from '@/lib/search/graphReads';
import { graphNodeDescription } from '@/lib/search/measureMenu';
import { notePosition, noteShown } from '@/lib/search/notePosition';
import { readNote, sendNote, subscribeNote } from '@/lib/search/openNote';
import type { GraphRef } from '@/lib/search/types';

// Every read shares one queue and one cache (see graphReads).
// The server renders every note closed.
const readNoNote = () => null;

const graph = graphReader({ fetchImpl: (url, init) => fetch(url, init) });

// The graph's own documentation for a source (the same door the Sources
// pages read), shared by every row that asks. A source with no page (the
// catalogue excludes it, or the read failed) resolves to null.
export const sourceDoc = (dcid: string) =>
    graph.read<{ description?: string | null }>(`/api/source-doc/${dcid}`);

const describeSource = (dcid: string): Promise<string | null> =>
    sourceDoc(dcid).then((doc) => doc?.description ?? null);

// Any other graph node's definition (a CRS code, a property, a StatVar),
// from the node door. A node the graph does not hold, or a failed read,
// resolves to null.
const describeNode = (dcid: string): Promise<string | null> =>
    graph.readNode(dcid).then(graphNodeDescription);

// A measure's values defined one per line ("Gross: An amount counted in
// full…"), leaving out a value the graph has no definition for. Null when
// it has none.
const describeValues = (values: GraphRef[]): Promise<string | null> =>
    Promise.all(values.map((value) => describeNode(value.dcid))).then((texts) => {
        const lines = values.flatMap((value, at) => {
            const text = texts[at];
            const label = value.label ?? value.dcid;

            return text ? [`${label.charAt(0).toUpperCase()}${label.slice(1)}: ${text}`] : [];
        });

        return lines.length > 0 ? lines.join('\n') : null;
    });

// The value a read resolves to, null until it does and when it rejects.
// Each caller makes its promise once per mount and key, so a re-render (the
// one a settled read causes included) waits on the same promise, and a
// failed read is asked again only when the menu next opens.
const useSettled = <TValue,>(pending: Promise<TValue | null>): TValue | null => {
    const [settled, setSettled] = useState<{
        pending: Promise<TValue | null>;
        value: TValue | null;
    } | null>(null);

    useEffect(() => {
        let active = true;

        pending
            .catch(() => null)
            .then((value) => {
                if (active) {
                    setSettled({ pending, value });
                }
            });

        return () => {
            active = false;
        };
    }, [pending]);

    return settled?.pending === pending ? settled.value : null;
};

/**
 * A fixed side note (`notePosition`) and its mark: beside the menu panel
 * holding `mark`, at the mark's height, or beside the mark's own block when
 * it sits outside any menu (a reading card). Placed once, before paint, so
 * the note shows at its current spot; `content` re-places it when its
 * text changes size.
 *
 * At most one note is open on the page (`openNote`). While `wanted` (hover,
 * keyboard focus, row highlight) the note asks to open, replacing any
 * other, and `toggle` pins it open. An open side note closes when its mark
 * moves (a scroll of the page or of the menu's own body), on a resize, on
 * Escape, on a press outside its mark, and when its menu closes (it
 * unmounts). A scroll that leaves the mark where the note was placed (a
 * keyboard highlight Radix scrolled into view before the placement) keeps
 * it.
 */
export const useSideNote = <TMark extends HTMLElement, TNote extends HTMLElement>({
    wanted,
    content,
}: {
    wanted: boolean;
    content: unknown;
}) => {
    const id = useId();
    const markRef = useRef<TMark>(null);
    const noteRef = useRef<TNote>(null);
    const placedAt = useRef<{ top: number; left: number } | null>(null);
    // This note's own state only, so a note opening elsewhere re-renders
    // just the note it replaces.
    const note = useSyncExternalStore(
        subscribeNote,
        () => {
            const current = readNote();

            return current?.id === id ? current : null;
        },
        readNoNote,
    );
    const open = note !== null;

    useEffect(() => {
        sendNote({ type: wanted ? 'show' : 'hide', id });
    }, [wanted, id]);

    useEffect(() => () => sendNote({ type: 'close', id }), [id]);

    useLayoutEffect(() => {
        const mark = markRef.current;
        const note = noteRef.current;

        if (!open || !mark || !note) {
            return;
        }

        const panel = mark.closest('[role="menu"]') ?? mark.parentElement ?? mark;
        const markBox = mark.getBoundingClientRect();
        // Offset sizes ignore the note's entry animation, which translates it.
        const { top, left } = notePosition({
            panel: panel.getBoundingClientRect(),
            mark: markBox,
            note: { width: note.offsetWidth, height: note.offsetHeight },
            screen: {
                width: document.documentElement.clientWidth,
                height: document.documentElement.clientHeight,
            },
        });

        note.style.left = `${left}px`;
        note.style.top = `${top}px`;
        placedAt.current = { top: markBox.top, left: markBox.left };
    }, [open, content]);

    useEffect(() => {
        const mark = markRef.current;

        // A coarse pointer shows no side note (the styles hide it), so
        // nothing on the page can misplace it.
        if (!open || !mark || !noteRef.current || !noteShown(noteRef.current)) {
            return;
        }

        const close = () => sendNote({ type: 'close', id });
        const onScroll = () => {
            const box = mark.getBoundingClientRect();

            if (box.top !== placedAt.current?.top || box.left !== placedAt.current.left) {
                close();
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close();
            }
        };
        const onPointerDown = (event: PointerEvent) => {
            if (!(event.target instanceof Node && mark.contains(event.target))) {
                close();
            }
        };

        // Capture, since a scroll does not bubble and a menu body scrolls
        // on its own.
        document.addEventListener('scroll', onScroll, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('resize', close);

        return () => {
            document.removeEventListener('scroll', onScroll, true);
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('resize', close);
        };
    }, [open, id]);

    return {
        id,
        open,
        pinned: note?.pinned ?? false,
        toggle: () => sendNote({ type: 'toggle', id }),
        markRef,
        noteRef,
    };
};

/**
 * An info icon at the end of a menu row (an OptionRow): while Radix
 * highlights the row, by keyboard or pointer, or the pointer rests on the
 * icon, a note beside the menu panel (`useSideNote`) shows the graph's
 * description of the row's node. The note is also the row's
 * aria-describedby, so a screen reader reads it when the row takes focus. On a coarse pointer the icon and note
 * give way to the description as the row's second line. A node with no
 * description shows no icon. The note is a plain element in a portal,
 * mounted while the row is, and hidden until it is shown. A focusable
 * trigger or a nested Radix menu inside a menu item would sit outside the
 * menu's arrow-key focus, and a second menu root fights the open one for
 * focus.
 */
const InfoIcon = ({ pending }: { pending: Promise<string | null> }) => {
    const row = use(OptionRowInfo);
    const description = useSettled(pending);
    const [hovered, setHovered] = useState(false);
    const {
        open: shown,
        markRef,
        noteRef,
    } = useSideNote<HTMLSpanElement, HTMLSpanElement>({
        wanted: description !== null && ((row?.highlighted ?? false) || hovered),
        content: description,
    });
    const onDescribed = row?.onDescribed;

    useEffect(() => {
        if (!description || !onDescribed) {
            return;
        }

        onDescribed(true);

        return () => onDescribed(false);
    }, [description, onDescribed]);

    if (!description) {
        return null;
    }

    return (
        <>
            <span
                ref={markRef}
                aria-hidden="true"
                className={styles.optionInfo}
                data-state={shown ? 'open' : undefined}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                // The row underneath is the menu item, and a press on the
                // icon must not select it.
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
            >
                <Icon name="info" />
            </span>
            {/* On a touch screen, where nothing hovers, the definition is
                the row's second line (the styles show one or the other). The
                note below already describes the row to a screen reader. */}
            <span aria-hidden="true" className={styles.optionInfoLine}>
                {description}
            </span>
            {createPortal(
                <span
                    ref={noteRef}
                    id={row?.descriptionId}
                    role="tooltip"
                    hidden={!shown}
                    className={styles.optionInfoPopup}
                >
                    {description}
                </span>,
                document.body,
            )}
        </>
    );
};

/** A source row's icon, in the sentence's "Select Data Source" menu. */
export const SourceInfo = ({ dcid }: { dcid: string }) => {
    const pending = useMemo(() => describeSource(dcid), [dcid]);

    return <InfoIcon pending={pending} />;
};

/** A graph node's icon: an option's code, or a related measure's
 *  StatVar. */
export const GraphInfo = ({ dcid }: { dcid: string }) => {
    const pending = useMemo(() => describeNode(dcid), [dcid]);

    return <InfoIcon pending={pending} />;
};

/** A measure row's icon, defining the values its partition holds
 *  (`measureDefinitionValues`). */
export const MeasureInfo = ({ values }: { values: GraphRef[] }) => {
    // Keyed by content, since the menu builds a new list on every render.
    const key = JSON.stringify(values);
    const pending = useMemo(() => describeValues(JSON.parse(key)), [key]);

    return <InfoIcon pending={pending} />;
};

/** Each graph node's definition, in order, each null while unread and
 *  when the graph has none. The About line reads the nodes it defines
 *  through here. */
export const useNodeDescriptions = (dcids: string[]): (string | null)[] => {
    // Keyed by content, since the About model is built on every render.
    const key = dcids.join('\n');
    const pending = useMemo(
        () =>
            Promise.all(
                key ? key.split('\n').map((dcid) => describeNode(dcid).catch(() => null)) : [],
            ),
        [key],
    );

    return useSettled(pending) ?? dcids.map(() => null);
};

/** Each source's description from its documentation page, and whether the
 *  catalogue has that page to link to, in order. Each reads null and false
 *  until the reads settle. */
export const useSourceDocs = (
    dcids: string[],
): { description: string | null; hasPage: boolean }[] => {
    const key = dcids.join('\n');
    const pending = useMemo(
        () =>
            Promise.all(
                key ? key.split('\n').map((dcid) => sourceDoc(dcid).catch(() => null)) : [],
            ),
        [key],
    );
    const docs = useSettled(pending);

    return dcids.map((_, at) => {
        const doc = docs?.[at] ?? null;

        return { description: doc?.description ?? null, hasPage: doc != null };
    });
};
