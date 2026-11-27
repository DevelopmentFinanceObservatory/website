'use client';

import * as Popover from '@radix-ui/react-popover';
import {
    type Dispatch,
    type ReactNode,
    type SetStateAction,
    useEffect,
    useId,
    useState,
} from 'react';

import styles from './ArtifactFields.module.scss';

import Button from '@/components/atoms/Button/Button';
import {
    addTopic,
    type EvergreenError,
    type EvergreenWarning,
    type EvergreenField,
    evergreenFailureText,
    loadTopics,
    readEvergreenAnswer,
    sameField,
} from '@/lib/library/client';
import { type ArtifactText, LIMITS } from '@/lib/library/publish';

/**
 * The fields a publisher writes about a Library artifact: title,
 * description, topics, and the optional text section. The Studio's Publish
 * tab and the artifact page's Edit dialog both show them, with their own
 * fields (`children`) between the topics and the text section. The Publish
 * tab also shows its URL field (`address`) under the title.
 *
 * The topics are the Library's own list, read on mount. A publisher picks
 * from them, and adds one through the "+" beside them.
 */

/** No text and no topic, with `title` to start from. */
export const blankText = (title: string): ArtifactText => ({
    title,
    description: '',
    contentTitle: null,
    content: null,
    topics: [],
});

/** Whether the text can be sent: it has a title and a description. */
export const isComplete = (text: ArtifactText): boolean =>
    text.title.trim() !== '' && text.description.trim() !== '';

const AddTopic = ({
    onAdded,
    onRefused,
}: {
    onAdded: (topics: string[], label: string) => void;
    // The add was refused, so the list may hold a topic this page lacks.
    onRefused: () => void;
}) => {
    const [open, setOpen] = useState(false);
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const add = async () => {
        const name = label.trim();

        if (!name || busy) {
            return;
        }

        setBusy(true);
        setError(null);

        const answer = await addTopic(name);

        setBusy(false);

        if (!answer.ok) {
            setError(answer.detail);
            onRefused();

            return;
        }

        onAdded(answer.value.topics, name.replace(/\s+/g, ' '));
        setLabel('');
        setOpen(false);
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <Button variant="chip" className={styles.topicAdd} aria-label="Add a topic">
                    +
                </Button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className={styles.add}
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    collisionPadding={8}
                >
                    <label className={styles.addLabel} htmlFor="library-topic">
                        Add Tag
                    </label>
                    <div className={styles.addRow}>
                        <input
                            id="library-topic"
                            className={styles.addInput}
                            value={label}
                            maxLength={LIMITS.topic}
                            placeholder="Tag name…"
                            onChange={(event) => setLabel(event.target.value)}
                            // Enter adds the tag and leaves the dialog's form alone.
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void add();
                                }
                            }}
                        />
                        <Button
                            variant="light"
                            small
                            onClick={add}
                            disabled={busy || !label.trim()}
                        >
                            Add
                        </Button>
                    </div>
                    {error && (
                        <p className={styles.addError} role="alert">
                            {error}
                        </p>
                    )}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

/** What the evergreen check refused in the text `submitted`, by field: the
 *  sentences with the line that says how to mend them, and the fields that
 *  were too long. A field shows its part only while it holds what was
 *  submitted. */
export type Refusals = {
    submitted: ArtifactText;
    fix: string | null;
    errors: readonly EvergreenError[];
    // Sentences flagged without a refusal.
    warnings: readonly EvergreenWarning[];
    limits: readonly { field: EvergreenField; detail: string }[];
};

/** What a refused publish or edit shows: the sentences under their fields, or
 *  one line for a failure of the check or any other refusal. `submitted` is
 *  the text the request carried. */
export const evergreenOutcome = (
    problem: unknown,
    fallback: string,
    submitted: ArtifactText,
): { refusals: Refusals | null; error: string | null } => {
    const answer = readEvergreenAnswer(problem);

    if (answer?.code === 'not_evergreen') {
        return {
            refusals: {
                submitted,
                fix: answer.fix,
                errors: answer.errors,
                warnings: answer.warnings,
                limits: [],
            },
            error: null,
        };
    }

    if (answer?.code === 'evergreen_too_long') {
        return {
            refusals: {
                submitted,
                fix: null,
                errors: [],
                warnings: [],
                limits: [{ field: answer.field, detail: answer.detail }],
            },
            error: null,
        };
    }

    return {
        refusals: null,
        error: answer ? evergreenFailureText(answer) : fallback,
    };
};

const RULE =
    'Say what the data measures and how to read it. Leave the numbers to the chart, which refreshes after publication.';
const FIELD_ORDER: readonly EvergreenField[] = ['title', 'description', 'contentTitle', 'content'];

/** The refused sentences of one field, under it. `fix` is given to the first
 *  refused field only, so the line shows once. */
const FieldRefusals = ({
    id,
    errors,
    warnings,
    limits,
    fix,
}: {
    id: string;
    errors: readonly EvergreenError[];
    warnings: readonly EvergreenWarning[];
    limits: readonly string[];
    fix: string | null;
}) => (
    <div className={styles.refused} id={id} role="alert">
        {limits.map((detail) => (
            <p key={detail}>{detail}</p>
        ))}
        <ul className={styles.refusedList}>
            {errors.map((error) => (
                <li key={`${error.start}-${error.end}`}>
                    <q>{error.quote}</q> {error.reason}
                </li>
            ))}
        </ul>
        {fix && <p className={styles.refusedFix}>{fix}</p>}
        {warnings.length > 0 && (
            <ul className={styles.warned}>
                {warnings.map((warning) => (
                    <li key={`${warning.start}-${warning.end}`}>
                        May change with the data: <q>{warning.quote}</q>
                    </li>
                ))}
            </ul>
        )}
    </div>
);

type ArtifactFieldsProps = {
    value: ArtifactText;
    // A state setter, called with updaters so a change made while a request
    // is out is kept.
    onChange: Dispatch<SetStateAction<ArtifactText>>;
    // Shown under the title.
    address?: ReactNode;
    children?: ReactNode;
    // The evergreen refusal of the last try, shown under the fields it names
    // while they hold what was sent.
    refusals?: Refusals | null;
};

const ArtifactFields = ({
    value,
    onChange,
    address,
    children,
    refusals = null,
}: ArtifactFieldsProps) => {
    const ids = useId();
    // Null until the list arrives.
    const [topics, setTopics] = useState<string[] | null>(null);
    const [topicsError, setTopicsError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;

        void loadTopics().then((answer) => {
            if (!live) {
                return;
            }

            if (answer.ok) {
                setTopics(answer.value.topics);
            } else {
                setTopics([]);
                setTopicsError(answer.detail);
            }
        });

        return () => {
            live = false;
        };
    }, []);

    const reload = () =>
        void loadTopics().then((answer) => answer.ok && setTopics(answer.value.topics));
    const set = (patch: Partial<ArtifactText>) => onChange((current) => ({ ...current, ...patch }));
    // The refusals that still hold, as the field holds what was sent.
    const standing = (field: EvergreenField) =>
        refusals && sameField(refusals.submitted, value, field)
            ? {
                  errors: refusals.errors.filter((error) => error.field === field),
                  warnings: refusals.warnings.filter((warning) => warning.field === field),
                  limits: refusals.limits
                      .filter((limit) => limit.field === field)
                      .map((limit) => limit.detail),
              }
            : { errors: [], warnings: [], limits: [] };
    const fixField = FIELD_ORDER.find((field) => standing(field).errors.length > 0);
    // What a field shows and sets for its refusals.
    const refused = (field: EvergreenField) => {
        const { errors, warnings, limits } = standing(field);
        const invalid = errors.length > 0 || limits.length > 0;
        const shown = invalid || warnings.length > 0;
        const id = `${ids}-${field}-refused`;

        return {
            input: {
                ...(invalid ? { 'aria-invalid': true } : {}),
                ...(shown ? { 'aria-describedby': id } : {}),
            },
            list:
                refusals && shown ? (
                    <FieldRefusals
                        id={id}
                        errors={errors}
                        warnings={warnings}
                        limits={limits}
                        fix={fixField === field ? refusals.fix : null}
                    />
                ) : null,
        };
    };
    const title = refused('title');
    const description = refused('description');
    const contentTitle = refused('contentTitle');
    const content = refused('content');
    const pick = (topic: string, on: boolean) =>
        onChange((current) => ({
            ...current,
            topics: on
                ? [...new Set([...current.topics, topic])]
                : current.topics.filter((other) => other !== topic),
        }));
    // A topic the artifact holds stays listed while the list loads.
    const listed = [...new Set([...(topics ?? []), ...value.topics])].sort((a, b) =>
        a.localeCompare(b, 'en'),
    );

    return (
        <>
            <p className={styles.rule}>{RULE}</p>
            <div className={styles.group}>
                <label className={styles.field}>
                    <span className={styles.label}>Title</span>
                    <input
                        className={styles.input}
                        value={value.title}
                        maxLength={LIMITS.title}
                        placeholder="Enter title…"
                        required
                        {...title.input}
                        onChange={(event) => set({ title: event.target.value })}
                    />
                </label>
                {title.list}
            </div>
            {address}
            <div className={styles.group}>
                <label className={styles.field}>
                    <span className={styles.label}>Description</span>
                    <textarea
                        className={styles.textarea}
                        value={value.description}
                        maxLength={LIMITS.description}
                        placeholder="Enter description…"
                        rows={3}
                        required
                        {...description.input}
                        onChange={(event) => set({ description: event.target.value })}
                    />
                </label>
                {description.list}
            </div>
            <fieldset className={styles.field}>
                <legend className={styles.label}>Topics</legend>
                <div className={styles.topics}>
                    {listed.map((topic) => (
                        <Button
                            key={topic}
                            variant="chip"
                            aria-pressed={value.topics.includes(topic)}
                            onClick={() => pick(topic, !value.topics.includes(topic))}
                        >
                            {topic}
                        </Button>
                    ))}
                    {topics !== null && (
                        <AddTopic
                            onRefused={reload}
                            onAdded={(next, label) => {
                                setTopics(next);
                                // The topic as the list holds it, picked.
                                const added = next.find(
                                    (topic) => topic.toLowerCase() === label.toLowerCase(),
                                );

                                if (added) {
                                    pick(added, true);
                                }
                            }}
                        />
                    )}
                </div>
                {topicsError && (
                    <p className={styles.error} role="alert">
                        {topicsError}
                    </p>
                )}
            </fieldset>
            {children}
            <div className={styles.group}>
                <label className={styles.field}>
                    <span className={styles.label}>Content Title (Optional)</span>
                    <input
                        className={styles.input}
                        value={value.contentTitle ?? ''}
                        maxLength={LIMITS.contentTitle}
                        placeholder="Enter content title…"
                        {...contentTitle.input}
                        onChange={(event) => set({ contentTitle: event.target.value || null })}
                    />
                </label>
                {contentTitle.list}
            </div>
            <div className={styles.group}>
                <label className={styles.field}>
                    <span className={styles.label}>Content (Optional)</span>
                    <textarea
                        className={styles.textarea}
                        value={value.content ?? ''}
                        maxLength={LIMITS.content}
                        placeholder="Enter text content…"
                        rows={3}
                        {...content.input}
                        onChange={(event) => set({ content: event.target.value || null })}
                    />
                </label>
                {content.list}
            </div>
        </>
    );
};

export default ArtifactFields;
