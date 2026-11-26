'use client';

import { useRef, useState } from 'react';

import styles from './PublishPanel.module.scss';
import type { ShareScope } from './ShareModal';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import ArtifactFields, {
    blankText,
    isComplete,
} from '@/components/organisms/Library/ArtifactFields';
import type { ShareMode } from '@/lib/chat/shareMode';
import type { Widget } from '@/lib/chat/widgets';
import { artifactPath } from '@/lib/library/artifact';
import { publishArtifact } from '@/lib/library/client';
import { publishedFacts } from '@/lib/library/publish';
import { panelViewOf } from '@/lib/studio/infoPanel';
import { isLiveDataCard } from '@/lib/studio/liveCards';
import { openShareLink, type ShareLink, type ShareLinkDeps } from '@/lib/studio/shareDialog';

/**
 * The Share dialog's Publish tab, which admins alone are shown: it puts the
 * canvas, or one card of it, in the Library under a citable URL. Publishing
 * makes a share of the chosen artifact (live, or a snapshot) and files it
 * with the text written here, the sources its cards credit and, for one
 * card, the steps it was made by.
 */

const CANVAS = 'canvas';

const COPY = {
    lead: 'Make this output permanently available in the Library with a citable URL.',
    live: 'Resolves against the latest source data so viewers always see current values.',
    snapshot: 'Keeps the values it shows at the moment it is published.',
    noLive: 'This output draws no data, so it is published as a snapshot.',
    failed: 'The link for it was not made. Try again.',
    limited: "This network has made today's links. Try again tomorrow.",
    refused: 'This cannot be published as it stands.',
    withdrawn: 'Its cards cannot show live data. Publish it as a snapshot.',
};

const linkError = (link: ShareLink | null): string => {
    switch (link?.status) {
        case 'limited':
            return COPY.limited;
        case 'refused':
            return COPY.refused;
        case 'withdrawn':
            return COPY.withdrawn;
        default:
            return COPY.failed;
    }
};

type PublishPanelProps = {
    scope: ShareScope;
    // The conversation's title, a canvas's first title.
    title: string;
    // The cards on the sheet, and each one's title as its face shows it.
    widgets: readonly Widget[];
    titleOf: (id: string) => string;
    createShare: ShareLinkDeps['createShare'];
};

const PublishPanel = ({ scope, title, widgets, titleOf, createShare }: PublishPanelProps) => {
    const cards = widgets.filter((widget) => widget.kind !== 'text');
    const options =
        scope.kind === 'card'
            ? [{ id: scope.id, label: 'Chart' }]
            : [
                  { id: CANVAS, label: 'Canvas' },
                  ...cards.map((card) => ({ id: card.id, label: `Chart: ${titleOf(card.id)}` })),
              ];
    const [picked, setPicked] = useState(options[0].id);
    const [text, setText] = useState(() => blankText(scope.kind === 'card' ? scope.title : title));
    const [live, setLive] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slug, setSlug] = useState<string | null>(null);
    // The share made for each artifact and mode, so a publish sent again
    // after a refusal files the share it has.
    const sharesRef = useRef(new Map<string, { id: string; mode: ShareMode }>());

    const subjects = picked === CANVAS ? cards : cards.filter((card) => card.id === picked);
    const canLive = subjects.some(isLiveDataCard);
    const mode: ShareMode = canLive && live ? 'live' : 'snapshot';

    const publish = async (event: React.FormEvent) => {
        event.preventDefault();

        if (busy || !isComplete(text)) {
            return;
        }

        setBusy(true);
        setError(null);

        const kind = picked === CANVAS ? 'canvas' : 'chart';
        const shareKey = `${picked}:${mode}`;
        let share = sharesRef.current.get(shareKey);

        if (!share) {
            const made = await new Promise<ShareLink | null>((resolve) => {
                void openShareLink(
                    { createShare },
                    {
                        kind: kind === 'canvas' ? 'canvas' : 'card',
                        cardId: kind === 'canvas' ? undefined : picked,
                        mode,
                    },
                    resolve,
                ).catch(() => resolve(null));
            });

            if (made?.status !== 'ready') {
                setError(linkError(made));
                setBusy(false);

                return;
            }

            share = { id: made.id, mode: made.mode };
            sharesRef.current.set(shareKey, share);
        }

        const today = new Date().toLocaleDateString('en-CA');
        const answer = await publishArtifact({
            ...text,
            shareId: share.id,
            kind,
            mode: share.mode,
            ...publishedFacts(
                subjects.flatMap((card) =>
                    card.info ? [panelViewOf(card.info, { retrievedOn: today })] : [],
                ),
            ),
        });

        setBusy(false);

        if (answer.ok) {
            setSlug(answer.value.slug);
        } else {
            setError(answer.detail);
        }
    };

    if (slug) {
        return (
            <div className={styles.done} role="status">
                <p className={styles.doneTitle}>Published to the Library</p>
                <p className={styles.copyText}>
                    “{text.title}” has its own page, which anyone can open and cite.
                </p>
                <Button href={artifactPath(slug)} variant="dark" full icon="arrow" target="_blank">
                    View in Library
                </Button>
            </div>
        );
    }

    return (
        <form className={styles.form} onSubmit={publish}>
            <p className={styles.copyText}>{COPY.lead}</p>
            <ArtifactFields value={text} onChange={setText}>
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
                                // The title follows the artifact until it is edited.
                                setText((current) => {
                                    const was = picked === CANVAS ? title : titleOf(picked);

                                    return current.title === was
                                        ? {
                                              ...current,
                                              title: next === CANVAS ? title : titleOf(next),
                                          }
                                        : current;
                                });
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
                <div className={styles.field} role="group" aria-labelledby="publish-type">
                    <span className={styles.label} id="publish-type">
                        Publication Type
                    </span>
                    <label className={styles.toggle}>
                        <input
                            type="checkbox"
                            role="switch"
                            className={styles.switch}
                            checked={mode === 'live'}
                            disabled={!canLive}
                            aria-describedby="publish-type-note"
                            onChange={(event) => setLive(event.target.checked)}
                        />
                        <span>
                            <span className={styles.toggleLabel}>
                                {mode === 'live' ? 'Live Data' : 'Snapshot'}
                            </span>
                            <span className={styles.toggleNote} id="publish-type-note">
                                {!canLive
                                    ? COPY.noLive
                                    : mode === 'live'
                                      ? COPY.live
                                      : COPY.snapshot}
                            </span>
                        </span>
                    </label>
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
