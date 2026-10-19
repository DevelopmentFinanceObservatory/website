import { sendMail, smtpConfigured } from '@/lib/mail/smtp';

// Email half of the feedback backend, sent through the site's SMTP transport (src/lib/mail/smtp).
// FEEDBACK_TO is unset until ONE picks the inbox. data@one.org is the de facto DFO contact address if a default is ever wanted.
// Unset SMTP_HOST means email is off and the route relies on storage alone.

export const mailerConfigured = (): boolean =>
    smtpConfigured() && Boolean(process.env.FEEDBACK_TO && process.env.FEEDBACK_FROM);

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
