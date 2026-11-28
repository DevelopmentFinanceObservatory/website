import classNames from 'classnames';
import { Fragment, type MouseEvent, useLayoutEffect, useRef, useState } from 'react';

import styles from './PromptDock.module.scss';
import type { QueuedMessage } from '../../../hooks/useChat';

import Icon from '@/components/atoms/Icon/Icon';
import { type DockRow, runningLabel } from '@/lib/studio/dockView';

/** The 14 px spinner; it stands still under reduced motion. */
export const Spinner = () => <span className={styles.spin} aria-hidden />;

/** The question in one line, under an `About <title>` line when it was
 *  asked about a card. */
export const QuestionHead = ({ text, about }: { text: string; about: string | null }) => (
    <div className={styles.headPlain}>
        {about && (
            <p className={styles.aboutLine}>
                About <span className={styles.aboutTitle}>{about}</span>
            </p>
        )}
        {/* The landing's travelling prompt draws this line itself (PromptShell.tsx). */}
        <p className={styles.questionText} title={text} data-dock-question="">
            {text}
        </p>
    </div>
);

/** The running question's row: spinner, label, the plan step, the stall
 *  note, and Stop. */
export const StatusRow = ({
    status,
    stalled,
    stepOf,
    onStop,
}: {
    status: string | null;
    stalled: boolean;
    stepOf: { step: number; of: number } | null;
    onStop: () => void;
}) => (
    <div className={styles.row}>
        <Spinner />
        <span className={styles.rowText}>
            {runningLabel(status)}
            {stalled && <span className={styles.rowMeta}> · Connection seems stalled</span>}
        </span>
        {stepOf && (
            <span className={styles.rowMeta}>
                Step {stepOf.step} of {stepOf.of}
            </span>
        )}
        <button type="button" className={styles.textBtn} onClick={onStop}>
            Stop
        </button>
    </div>
);

/** The folded reply: its opening, and the control that opens it. The whole
 *  row is a press target; only the control takes focus. The control reads
 *  `Read answer` when the reply holds more than the row shows, and the end
 *  of the row's second line fades when its text overflows. A refused card
 *  change has no reply to open, and shows its first sentence alone. */
export const FoldedRow = ({
    row,
    onOpen,
}: {
    row: Extract<DockRow, { kind: 'folded' }>;
    onOpen: () => void;
}) => {
    const textRef = useRef<HTMLSpanElement>(null);
    const [overflow, setOverflow] = useState(false);
    const excerpt = row.openable ? row.parts.map((part) => part.text).join('') : null;

    // The observer reports once on observe, before paint, and again as the
    // dock's width changes the text's wrapping.
    useLayoutEffect(() => {
        const el = textRef.current;

        if (!el) {
            return;
        }

        const measure = () => setOverflow(el.scrollHeight > el.clientHeight + 1);
        const observer = new ResizeObserver(measure);

        observer.observe(el);
        // A web font that loads late rewraps the text without resizing it.
        void document.fonts.ready.then(measure);

        return () => observer.disconnect();
    }, [excerpt]);

    if (!row.openable) {
        return (
            <div className={styles.row}>
                <span className={classNames(styles.rowText, styles.rowMuted)}>{row.text}</span>
            </div>
        );
    }

    const cue = row.more || overflow;
    const open = (event: MouseEvent) => {
        event.stopPropagation();
        onOpen();
    };

    return (
        <div
            className={classNames(styles.row, styles.rowPress, styles.rowFold)}
            data-cue={cue || undefined}
            data-fade={overflow || undefined}
            onClick={onOpen}
        >
            <span ref={textRef} className={styles.foldText}>
                {row.parts.map((part, at) =>
                    part.strong ? (
                        <strong key={at}>{part.text}</strong>
                    ) : (
                        <Fragment key={at}>{part.text}</Fragment>
                    ),
                )}
            </span>
            {cue ? (
                <button
                    type="button"
                    className={classNames(styles.textBtn, styles.foldCue)}
                    aria-expanded="false"
                    data-dock="open"
                    onClick={open}
                >
                    Read answer
                    <Icon name="chevron-down" className={styles.chevronUp} />
                </button>
            ) : (
                <button
                    type="button"
                    className={classNames(styles.iconBtn, styles.chevronUp, styles.foldCue)}
                    aria-label="Open the reply"
                    aria-expanded="false"
                    data-dock="open"
                    onClick={open}
                >
                    <Icon name="chevron-down" />
                </button>
            )}
        </div>
    );
};

/** The card the next question is about, in the input row: the word
 *  `About`, then a chip with its kind icon, its title (which flies the
 *  canvas to it) and the clear button. The group's name carries the word. */
export const AboutChip = ({
    title,
    icon,
    onGo,
    onClear,
}: {
    title: string;
    icon: 'chart-bar' | 'chart-line' | 'chart-table' | 'key-number' | 'note';
    onGo: () => void;
    onClear: () => void;
}) => (
    <span className={styles.about} role="group" aria-label={`About ${title}`}>
        <span className={styles.rowMeta} aria-hidden="true">
            About
        </span>
        <span className={styles.chip}>
            <Icon name={icon} className={styles.chipIcon} />
            <button type="button" className={styles.chipTitle} title={title} onClick={onGo}>
                {title}
            </button>
            <button
                type="button"
                className={styles.chipClear}
                aria-label={`Stop asking about ${title}`}
                onClick={onClear}
            >
                <Icon name="closer" />
            </button>
        </span>
    </span>
);

/** The waiting plan's approval row. While a switch is in flight both
 *  buttons wait. */
export const ApprovalRow = ({
    busy,
    onCancel,
    onApprove,
}: {
    busy: boolean;
    onCancel: () => void;
    onApprove: () => void;
}) => (
    <div className={styles.row}>
        <span className={styles.rowText}>Approve this plan?</span>
        <span className={styles.rowActions}>
            <button
                type="button"
                className={styles.btn}
                aria-disabled={busy || undefined}
                onClick={busy ? undefined : onCancel}
            >
                Cancel
            </button>
            <button
                type="button"
                className={classNames(styles.btn, styles.btnDark)}
                aria-disabled={busy || undefined}
                onClick={busy ? undefined : onApprove}
            >
                Approve
            </button>
        </span>
    </div>
);

/** A cancelled plan, with `View plan` when the page still holds it. */
export const SetAsideRow = ({ onView }: { onView: (() => void) | null }) => (
    <div className={styles.row}>
        <span className={styles.rowText}>Plan set aside</span>
        {onView && (
            <button
                type="button"
                className={styles.textBtn}
                aria-haspopup="dialog"
                onClick={onView}
            >
                View plan
            </button>
        )}
    </div>
);

/** Messages waiting behind the running question, each with its remove
 *  control. */
export const QueuedRows = ({
    queued,
    onRemove,
}: {
    queued: QueuedMessage[];
    onRemove: (id: string) => void;
}) =>
    queued.map((item) => (
        <div key={item.id} className={styles.row}>
            <span className={styles.rowMeta}>Next</span>
            <span className={styles.rowText} title={item.text}>
                {item.card?.title && `About “${item.card.title}”: `}
                {item.text}
            </span>
            <button
                type="button"
                className={styles.iconBtn}
                aria-label="Remove this queued message"
                onClick={() => onRemove(item.id)}
            >
                <Icon name="closer" />
            </button>
        </div>
    ));
