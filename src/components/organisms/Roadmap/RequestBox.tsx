'use client';

import { useState } from 'react';

import styles from './Roadmap.module.scss';

import type { RoadmapArea } from './roadmapData';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';

type Copy = {
    /** the dark bar's second line */
    lead: string;
    /** the dialog's own title */
    title: string;
    /** what the form asks for, above the field */
    ask: string;
    /** the field's placeholder, which is also its label */
    placeholder: string;
    /** what the message carries into Slack, the table and the mailbox */
    label: string;
};

/**
 * A request means something different on each track, so the bar and its form
 * say so (QA-17). The keys are the track ids from dfo-docs; a track this
 * does not know falls back to the data wording, which is the general case.
 */
const COPY: Record<string, Copy> = {
    data: {
        lead: 'Tell us what data you need. Requests are reviewed by the DFO data team and inform the roadmap.',
        title: 'Request data',
        ask: 'Which indicator, country or source are you missing, and what would you do with it? The more specific, the easier it is to place on the roadmap.',
        placeholder: 'The data you need...',
        label: '[Data request]',
    },
    platform: {
        lead: 'Tell us what the platform is missing. Requests are reviewed by the DFO team and inform the roadmap.',
        title: 'Request a platform change',
        ask: 'What do you want to do with the data, and what stops you today? The API, downloads, embedding and accounts all live on this track.',
        placeholder: 'What the platform should do...',
        label: '[Platform request]',
    },
    'ai-tools': {
        lead: 'Tell us what you want the AI tools to do. Requests are reviewed by the DFO team and inform the roadmap.',
        title: 'Request an AI tool',
        ask: 'What would you like to ask for, and where does the assistant fall short today? Studio, the MCP server and the skills all live on this track.',
        placeholder: 'What the AI tools should do...',
        label: '[AI tools request]',
    },
};

/**
 * "Have a request?" — the dark bar over the upcoming items, and the form its
 * button opens. It used to be a mailto, which handed the reader an empty
 * draft and lost every request that never got sent (QA-16).
 */
const RequestBox = ({ area }: { area: RoadmapArea }) => {
    const copy = COPY[area] ?? COPY.data!;
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [email, setEmail] = useState('');
    // The honeypot: off-screen, never tabbed into. A bot that fills it gets
    // the same answer as everyone else and learns nothing.
    const [website, setWebsite] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const close = (next: boolean) => {
        setOpen(next);

        if (next) {
            return;
        }

        setError(null);

        // A sent request starts clean next time; an unsent one keeps what
        // was typed, so closing by accident costs nothing.
        if (sent) {
            setSent(false);
            setMessage('');
            setEmail('');
        }
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!message.trim() || sending) {
            return;
        }

        setSending(true);
        setError(null);

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    message: `${copy.label} ${message.trim()}`,
                    email: email.trim() || undefined,
                    page: location.pathname + location.search,
                    website,
                }),
            });
            const body = (await res.json().catch(() => null)) as { message?: string } | null;

            if (!res.ok) {
                setError(body?.message ?? 'That did not go through. Please try again.');

                return;
            }

            setSent(true);
        } catch {
            setError('That did not go through. Please try again.');
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            <div className={styles.request}>
                <div>
                    <h2 className={styles.requestTitle}>Have a request?</h2>
                    <p className={styles.requestLead}>{copy.lead}</p>
                </div>
                <Button icon="arrow-up-right" onClick={() => setOpen(true)}>
                    Submit Request
                </Button>
            </div>

            <Modal
                open={open}
                onOpenChange={close}
                title={copy.title}
                placement="center"
                fit
                autoFocus
            >
                {sent ? (
                    <p className={styles.requestDone}>
                        Thanks — your request is with the data team. If you left an address, they
                        will come back to you.
                    </p>
                ) : (
                    <form className={styles.requestForm} onSubmit={submit}>
                        <p className={styles.requestFormLead}>{copy.ask}</p>
                        <textarea
                            className={styles.requestMessage}
                            value={message}
                            placeholder={copy.placeholder}
                            aria-label={copy.placeholder}
                            rows={5}
                            onChange={(event) => setMessage(event.target.value)}
                        />
                        <input
                            className={styles.requestEmail}
                            type="email"
                            value={email}
                            placeholder="Your email (optional, so we can reply)"
                            aria-label="Your email (optional, so we can reply)"
                            autoComplete="email"
                            onChange={(event) => setEmail(event.target.value)}
                        />
                        <input
                            className={styles.requestTrap}
                            type="text"
                            tabIndex={-1}
                            autoComplete="off"
                            aria-hidden="true"
                            value={website}
                            onChange={(event) => setWebsite(event.target.value)}
                        />
                        {error && <p className={styles.requestError}>{error}</p>}
                        <button
                            type="submit"
                            className={styles.requestSend}
                            disabled={!message.trim() || sending}
                        >
                            {sending ? 'Sending…' : 'Send request'}
                        </button>
                    </form>
                )}
            </Modal>
        </>
    );
};

export default RequestBox;
