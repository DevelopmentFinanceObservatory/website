'use client';

import { useId, useRef, useState } from 'react';

import styles from './PublishPanel.module.scss';
import type { ShareScope } from './ShareModal';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import { useLibraryEnabled } from '@/hooks/useLibraryEnabled';
import EvergreenWarnings from '@/components/organisms/Library/EvergreenWarnings';
import ArtifactFields, {
    blankText,
    evergreenOutcome,
    isComplete,
    type Refusals,
} from '@/components/organisms/Library/ArtifactFields';
import type { SavedConversation } from '@/lib/chat/history';
import type { ShareMode } from '@/lib/chat/shareMode';
import type { Widget } from '@/lib/chat/widgets';
import { artifactPath, kindLabel } from '@/lib/library/artifact';
import {
    type EvergreenWarning,
    isSlugTakenRefusal,
    isWithdrawnRefusal,
    publishArtifact,
    publishRefusalText,
    readEvergreenWarnings,
} from '@/lib/library/client';
import { LIMITS, publishKeySlot, readArtifactText, readSlug, slugOf } from '@/lib/library/publish';
import { isLiveDataCard } from '@/lib/studio/liveCards';

/**
 * The Share dialog's Publish tab, which admins alone are shown: it puts the
 * canvas, or one card of it, in the Library under a citable URL. Publishing
 * sends the saved conversation and the text written here, and the server
 * makes the share (live, or a snapshot) and files it with the sources its
 * cards credit and, for one card, the steps it was made by.
 *
 * The URL field shows the slug made from the title while the publisher
 * leaves it alone, and the panel sends no slug then, so the server makes it
 * from the title and numbers it (`-2`) when another artifact holds it. The
 * publisher's own entry is kept as typed while the field has focus, is
 * normalised with `slugOf` on blur and at submit, and is sent when it is not
 * blank; a blank field follows the title again. A slug another artifact holds
 * is refused at the field. The slug stays fixed once published, since
 * citations name the URL, so the Edit dialog leaves it out. The done view
 * links to the URL the server made, and says who can open it: anyone while
 * the Library is on, and its admins alone while it is off. Until
 * GET /api/library/enabled answers, or when it fails, it says neither.
 *
 * A publish makes an unlisted share, which anyone with its /s/ link can
 * open whether the Library is on or off. Publish only material cleared for
 * public access, preview included.
 */

const CANVAS = 'canvas';

const COPY = {
    lead: 'Make this output permanently available in the Library with a citable URL.',
    live: 'Live data. Resolves against the latest source data so viewers always see current values.',
    snapshot: 'Snapshot. Keeps the values it shows at the moment it is published.',
    noLive: 'This output draws no data, so it is published as a snapshot.',
    failed: 'It was not published. Try again.',
    none: 'A text card cannot be published. Publish a chart, a table or a key number.',
    numbered: 'A number is added if another artifact uses this address.',
};

// The cards the Library takes on their own: a chart, a table or a key number.
type PublishableCard = Widget & { kind: 'chart' | 'table' | 'key_number' };

const isPublishable = (widget: Widget): widget is PublishableCard =>
    widget.kind === 'chart' || widget.kind === 'table' || widget.kind === 'key_number';

// A title as the Library takes it, so a prefilled one is never refused.
const prefill = (title: string): string => title.slice(0, LIMITS.title);

type PublishPanelProps = {
    scope: ShareScope;
    // The conversation's title, a canvas's first title.
    title: string;
    // The cards on the sheet, and each one's title as its face shows it.
    widgets: readonly Widget[];
    titleOf: (id: string) => string;
    // The conversation as it is saved, which the publish sends, or null when
    // there is none to send.
    snapshot: () => SavedConversation | null;
};

const PublishPanel = ({ scope, title, widgets, titleOf, snapshot }: PublishPanelProps) => {
    const cards = widgets.filter((widget) => widget.kind !== 'text');
    const publishable = widgets.filter(isPublishable);
    const options =
        scope.kind === 'card'
            ? publishable
                  .filter((card) => card.id === scope.id)
                  .map((card) => ({ id: card.id, label: kindLabel(card.kind) }))
            : [
                  { id: CANVAS, label: kindLabel('canvas') },
                  ...publishable.map((card) => ({
                      id: card.id,
                      label: `${kindLabel(card.kind)}: ${titleOf(card.id)}`,
                  })),
              ];
    const [picked, setPicked] = useState(options[0]?.id ?? CANVAS);
    const [text, setText] = useState(() =>
        blankText(prefill(scope.kind === 'card' ? scope.title : title)),
    );
    const [live, setLive] = useState(true);
    const [busy, setBusy] = useState(false);
    // The slug as typed, or null while it follows the title. A blank entry
    // also follows the title.
    const [slug, setSlug] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [slugError, setSlugError] = useState<string | null>(null);
    const [refusals, setRefusals] = useState<Refusals | null>(null);
    const [published, setPublished] = useState<{
        slug: string;
        title: string;
        warnings: EvergreenWarning[];
    } | null>(null);
    // One key per slot (`publishKeySlot`: artifact, mode and chosen slug),
    // made on its first try and sent again on every retry.
    const keysRef = useRef(new Map<string, string>());
    const ids = useId();
    const libraryEnabled = useLibraryEnabled();

    const subjects = picked === CANVAS ? cards : cards.filter((card) => card.id === picked);
    const canLive = subjects.some(isLiveDataCard);
    const typedSlug = slug !== null && slug.trim() !== '' ? slug : null;
    const shownSlug = slug ?? (text.title.trim() ? slugOf(text.title) : '');
    const mode: ShareMode = canLive && live ? 'live' : 'snapshot';

    const publishKey = (at: string): string => {
        const known = keysRef.current.get(at);

        if (known) {
            return known;
        }

        const made = crypto.randomUUID();

        keysRef.current.set(at, made);

        return made;
    };

    const publish = async (event: React.FormEvent) => {
        event.preventDefault();

        if (busy || !isComplete(text) || options.length === 0) {
            return;
        }

        const checked = readArtifactText(text);

        if (!checked.ok) {
            setError(checked.detail);

            return;
        }

        const chosen = readSlug(typedSlug === null ? undefined : slugOf(typedSlug));

        if (!chosen.ok) {
            setSlugError(chosen.detail);

            return;
        }

        const conversation = snapshot();

        if (!conversation) {
            setError(COPY.failed);

            return;
        }

        setBusy(true);
        setError(null);
        setRefusals(null);
        setSlugError(null);

        const single = picked !== CANVAS;
        const slot = publishKeySlot(picked, mode, chosen.value);
        const answer = await publishArtifact({
            ...checked.value,
            publishKey: publishKey(slot),
            ...(chosen.value ? { slug: chosen.value } : {}),
            share: {
                kind: single ? 'card' : 'canvas',
                conversation,
                cardId: single ? picked : undefined,
                mode,
            },
        });

        setBusy(false);

        if (answer.ok) {
            setPublished({ ...answer.value, warnings: readEvergreenWarnings(answer.value) });
        } else {
            if (isWithdrawnRefusal(answer.problem)) {
                // The withdrawn artifact owns this key, so the next try
                // starts a new one.
                keysRef.current.delete(slot);
                // A new try follows the title, so the server numbers the
                // slug the withdrawn artifact keeps.
                setSlug(null);
            }

            const refusal = publishRefusalText(
                answer.problem,
                answer.detail,
                subjects.map((card) => ({ id: card.id, title: titleOf(card.id) })),
                single,
            );

            if (isSlugTakenRefusal(answer.problem)) {
                setSlugError(refusal);
            } else {
                const outcome = evergreenOutcome(answer.problem, refusal, text);

                setRefusals(outcome.refusals);
                setError(outcome.error);
            }
        }
    };

    if (published) {
        return (
            <div className={styles.done} role="status">
                <p className={styles.doneTitle}>Published to the Library</p>
                <p className={styles.copyText}>
                    {libraryEnabled === null
                        ? `“${published.title}” has its own page in the Library.`
                        : libraryEnabled
                          ? `“${published.title}” has its own page, which anyone can open and cite.`
                          : `“${published.title}” has its own page in the Library’s preview, which only Library admins can open until the Library is switched on.`}
                </p>
                {published.warnings.length > 0 && (
                    <EvergreenWarnings warnings={published.warnings} />
                )}
                <Button
                    href={artifactPath(published.slug)}
                    prefetch={false}
                    variant="dark"
                    full
                    icon="arrow"
                    target="_blank"
                >
                    View in Library
                </Button>
            </div>
        );
    }

    if (options.length === 0) {
        return <p className={styles.copyText}>{COPY.none}</p>;
    }

    return (
        <form className={styles.form} onSubmit={publish}>
            <p className={styles.copyText}>{COPY.lead}</p>
            <ArtifactFields
                value={text}
                onChange={setText}
                refusals={refusals}
                mode={mode}
                address={
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor={`${ids}-slug`}>
                            URL
                        </label>
                        <span className={styles.addressBox}>
                            <span className={styles.addressPrefix} aria-hidden="true">
                                {artifactPath('')}
                            </span>
                            <input
                                id={`${ids}-slug`}
                                className={styles.addressInput}
                                value={shownSlug}
                                maxLength={LIMITS.slug}
                                spellCheck={false}
                                autoCapitalize="off"
                                aria-invalid={slugError !== null}
                                aria-describedby={
                                    slugError
                                        ? `${ids}-slug-error`
                                        : typedSlug === null
                                          ? `${ids}-slug-note`
                                          : undefined
                                }
                                onChange={(event) => {
                                    setSlug(event.target.value);
                                    setSlugError(null);
                                }}
                                // Blank follows the title again.
                                onBlur={() =>
                                    setSlug((typed) =>
                                        typed !== null && typed.trim() !== ''
                                            ? slugOf(typed)
                                            : null,
                                    )
                                }
                            />
                        </span>
                        {slugError ? (
                            <p className={styles.error} id={`${ids}-slug-error`} role="alert">
                                {slugError}
                            </p>
                        ) : (
                            typedSlug === null && (
                                <p className={styles.addressNote} id={`${ids}-slug-note`}>
                                    {COPY.numbered}
                                </p>
                            )
                        )}
                    </div>
                }
            >
                <label className={styles.field}>
                    <span className={styles.label}>Select Artifact</span>
                    <span className={styles.selectBox}>
                        <select
                            className={styles.select}
                            value={picked}
                            disabled={options.length === 1}
                            onChange={(event) => {
                                const next = event.target.value;

                                setPicked(next);
                                // The URL follows the new artifact's title.
                                setSlug(null);
                                setSlugError(null);
                                // The title follows the artifact until it is edited.
                                const was = prefill(picked === CANVAS ? title : titleOf(picked));

                                if (text.title === was) {
                                    setText((current) => ({
                                        ...current,
                                        title: prefill(next === CANVAS ? title : titleOf(next)),
                                    }));
                                }
                            }}
                        >
                            {options.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <Icon name="chevron-down" className={styles.selectIcon} />
                    </span>
                </label>
                <div className={styles.field} role="group" aria-labelledby={`${ids}-type`}>
                    <span className={styles.label} id={`${ids}-type`}>
                        Publication Type
                    </span>
                    <div className={styles.toggle}>
                        <input
                            id={`${ids}-live`}
                            type="checkbox"
                            role="switch"
                            className={styles.switch}
                            checked={mode === 'live'}
                            disabled={!canLive}
                            aria-describedby={`${ids}-note`}
                            onChange={(event) => setLive(event.target.checked)}
                        />
                        <span>
                            <label className={styles.toggleLabel} htmlFor={`${ids}-live`}>
                                Live data
                            </label>
                            <span className={styles.toggleNote} id={`${ids}-note`}>
                                {!canLive
                                    ? COPY.noLive
                                    : mode === 'live'
                                      ? COPY.live
                                      : COPY.snapshot}
                            </span>
                        </span>
                    </div>
                </div>
            </ArtifactFields>
            {error && (
                <p className={styles.error} role="alert">
                    {error}
                </p>
            )}
            <Button
                variant="dark"
                full
                icon="arrow"
                type="submit"
                disabled={busy || !isComplete(text)}
            >
                {busy ? 'Publishing…' : 'Publish to Library'}
            </Button>
        </form>
    );
};

export default PublishPanel;
