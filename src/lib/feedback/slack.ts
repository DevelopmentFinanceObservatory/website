// Notification half of the feedback backend: posts each submission to a Slack channel through an incoming webhook.
// FEEDBACK_SLACK_WEBHOOK_URL is mounted from Secret Manager by dfo-infra; its placeholder version holds the literal `disabled`, which is why configured means "is a URL" rather than "is set". Non-Slack URLs stay accepted on purpose so a request bin or a test server can stand in for Slack.

export const slackConfigured = (): boolean =>
    /^https?:\/\//.test(process.env.FEEDBACK_SLACK_WEBHOOK_URL ?? '');

export interface FeedbackNotification {
    message: string;
    email: string | null;
    page: string | null;
}

// Slack renders mrkdwn in webhook text; &, < and > are its only escapes, and a submission is untrusted input.
const escapeMrkdwn = (value: string): string =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const sendFeedbackSlack = async (note: FeedbackNotification): Promise<void> => {
    const lines = [
        `*New DFO feedback*${note.page ? ` on \`${escapeMrkdwn(note.page)}\`` : ''}`,
        note.email ? `From: ${escapeMrkdwn(note.email)}` : 'From: (no email left)',
        `> ${escapeMrkdwn(note.message).split('\n').join('\n> ')}`,
    ];

    const response = await fetch(process.env.FEEDBACK_SLACK_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lines.join('\n') }),
    });

    if (!response.ok) {
        throw new Error(`Slack webhook answered ${response.status}`);
    }
};
