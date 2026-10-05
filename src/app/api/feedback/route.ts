import { NextRequest } from 'next/server';
import { mailerConfigured, sendFeedbackEmail } from '@/lib/feedback/mailer';
import { slackConfigured, sendFeedbackSlack } from '@/lib/feedback/slack';
import { storageConfigured, storeFeedback } from '@/lib/feedback/store';
import { track } from '@/lib/events/track';

// Feedback intake (POST /api/feedback). Three independent sinks, each active only when configured: storage in the website tenant database, a Slack channel via incoming webhook, and email over SMTP. Any subset is a valid deployment phase.
// The frontend contract is documented in docs/feedback.md. Responses mirror the brochure site's newsletter endpoint's { ok, message } shape so form code can treat them alike.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGE = 5000;
const MAX_PAGE = 300;
const MAX_EMAIL = 320;

const json = (status: number, ok: boolean, message: string) =>
    new Response(JSON.stringify({ ok, message }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

export const POST = async (req: NextRequest) => {
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json(400, false, 'Send feedback as JSON.');
    }

    // A filled honeypot marks a bot; answer as if accepted so the bot learns nothing.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
        return json(200, true, 'Thanks for your feedback!');
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message === '' || message.length > MAX_MESSAGE) {
        return json(400, false, `Feedback needs a message between 1 and ${MAX_MESSAGE} characters.`);
    }

    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    if (emailRaw.length > MAX_EMAIL || (emailRaw !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw))) {
        return json(400, false, 'That email address does not look right.');
    }
    const email = emailRaw === '' ? null : emailRaw;

    const pageRaw = typeof body.page === 'string' ? body.page.trim() : '';
    const page = pageRaw === '' ? null : pageRaw.slice(0, MAX_PAGE);

    if (!storageConfigured() && !slackConfigured() && !mailerConfigured()) {
        return json(503, false, 'Feedback is not configured on this deployment yet.');
    }

    let stored = false;
    if (storageConfigured()) {
        try {
            await storeFeedback({
                message,
                email,
                page,
                userAgent: req.headers.get('user-agent'),
            });
            stored = true;
        } catch (err) {
            console.error('feedback: store failed', err);
        }
    }

    let notified = false;
    if (slackConfigured()) {
        try {
            await sendFeedbackSlack({ message, email, page });
            notified = true;
        } catch (err) {
            console.error('feedback: slack failed', err);
        }
    }

    let mailed = false;
    if (mailerConfigured()) {
        try {
            await sendFeedbackEmail({ message, email, page });
            mailed = true;
        } catch (err) {
            console.error('feedback: email failed', err);
        }
    }

    // Losing a submission entirely is the one outcome worth a hard error; a failed sink is logged above and the submission survives through any other.
    if (!stored && !notified && !mailed) {
        return json(500, false, 'Something went wrong saving your feedback. Please try again.');
    }

    // Usage event (src/lib/events): the chat box's report opens with its own heading; the widget's is free text.
    void track(
        'feedback.submit',
        { kind: message.startsWith('Studio chat feedback') ? 'chat' : 'widget' },
        { page },
    );

    return json(200, true, 'Thanks for your feedback!');
};
