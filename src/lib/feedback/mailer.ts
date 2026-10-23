import { sendMail } from '@/lib/mail/send';
import { mailTransport } from '@/lib/mail/settings';

// Email half of the feedback backend, sent through the site's mail transport, the SES API when deployed and SMTP locally (src/lib/mail/settings).
// FEEDBACK_TO is unset until ONE picks the inbox. data@one.org is the de facto DFO contact address if a default is ever wanted.
// With no transport configured, email is off and the route relies on storage alone.

export const mailerConfigured = (): boolean =>
    !('missing' in mailTransport(process.env)) &&
    Boolean(process.env.FEEDBACK_TO && process.env.FEEDBACK_FROM);

export const sendFeedbackEmail = async (fields: {
    message: string;
    email: string | null;
    page: string | null;
}): Promise<void> => {
    const lines = [
        `Page: ${fields.page ?? 'not given'}`,
        `From: ${fields.email ?? 'not given'}`,
        '',
        fields.message,
    ];

    await sendMail({
        from: process.env.FEEDBACK_FROM,
        to: process.env.FEEDBACK_TO,
        replyTo: fields.email ?? undefined,
        subject: `DFO feedback${fields.page ? ` on ${fields.page}` : ''}`,
        text: lines.join('\n'),
    });
};
