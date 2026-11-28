import classNames from 'classnames';

import styles from './PromptDock.module.scss';
import type { QueuedMessage } from '../../../hooks/useChat';

import Icon from '@/components/atoms/Icon/Icon';
import { runningLabel } from '@/lib/studio/dockView';

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
        <p className={styles.questionText} title={text}>
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

/** The folded reply: its first sentence, and the chevron that opens it.
 *  The whole row is a press target; only the chevron takes focus. A
 *  refused card change has no reply to open. */
export const FoldedRow = ({ text, onOpen }: { text: string; onOpen: (() => void) | null }) => (
    <div
        className={classNames(styles.row, onOpen && styles.rowPress)}
        onClick={onOpen ?? undefined}
    >
        <span className={classNames(styles.rowText, styles.rowMuted)}>{text}</span>
        {onOpen && (
            <button
                type="button"
                className={classNames(styles.iconBtn, styles.chevronUp)}
                aria-label="Open the reply"
                aria-expanded="false"
                data-dock="open"
                onClick={(event) => {
                    event.stopPropagation();
                    onOpen();
                }}
            >
                <Icon name="chevron-down" />
            </button>
        )}
    </div>
);

/** The card the next question is about, with its kind icon, its title
 *  (which flies the canvas to it) and the clear button. */
export const AboutRow = ({
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
    <div className={styles.row}>
        <span className={styles.rowMeta}>About</span>
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
    </div>
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
