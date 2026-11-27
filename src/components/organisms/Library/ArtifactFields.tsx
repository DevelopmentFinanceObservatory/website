'use client';

import * as Popover from '@radix-ui/react-popover';
import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from 'react';

import styles from './ArtifactFields.module.scss';

import Button from '@/components/atoms/Button/Button';
import { addTopic, loadTopics } from '@/lib/library/client';
import { type ArtifactText, LIMITS } from '@/lib/library/publish';

/**
 * The fields a publisher writes about a Library artifact: title,
 * description, topics, and the optional text section. The Studio's Publish
 * tab and the artifact page's Edit dialog both show them, with their own
 * fields (`children`) between the topics and the text section.
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

type ArtifactFieldsProps = {
    value: ArtifactText;
    // A state setter, called with updaters so a change made while a request
    // is out is kept.
    onChange: Dispatch<SetStateAction<ArtifactText>>;
    children?: ReactNode;
};

const ArtifactFields = ({ value, onChange, children }: ArtifactFieldsProps) => {
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
            <label className={styles.field}>
                <span className={styles.label}>Title</span>
                <input
                    className={styles.input}
                    value={value.title}
                    maxLength={LIMITS.title}
                    placeholder="Enter title…"
                    required
                    onChange={(event) => set({ title: event.target.value })}
                />
            </label>
            <label className={styles.field}>
                <span className={styles.label}>Description</span>
                <textarea
                    className={styles.textarea}
                    value={value.description}
                    maxLength={LIMITS.description}
                    placeholder="Enter description…"
                    rows={3}
                    required
                    onChange={(event) => set({ description: event.target.value })}
                />
            </label>
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
            <label className={styles.field}>
                <span className={styles.label}>Content Title (Optional)</span>
                <input
                    className={styles.input}
                    value={value.contentTitle ?? ''}
                    maxLength={LIMITS.contentTitle}
                    placeholder="Enter content title…"
                    onChange={(event) => set({ contentTitle: event.target.value || null })}
                />
            </label>
            <label className={styles.field}>
                <span className={styles.label}>Content (Optional)</span>
                <textarea
                    className={styles.textarea}
                    value={value.content ?? ''}
                    maxLength={LIMITS.content}
                    placeholder="Enter text content…"
                    rows={3}
                    onChange={(event) => set({ content: event.target.value || null })}
                />
            </label>
        </>
    );
};

export default ArtifactFields;
