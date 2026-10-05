import nodemailer from 'nodemailer';

// Email half of the feedback backend, deliberately provider-agnostic: plain SMTP with every value from config, so ONE's eventual provider choice (Workspace relay, SendGrid, anything) is a config change and not a code change.
// FEEDBACK_TO is likewise unset until ONE picks the inbox; data@one.org is the de facto DFO contact address if a default is ever wanted.
// Unset SMTP_HOST means email is off and the route relies on storage alone.

export const mailerConfigured = (): boolean =>
    Boolean(process.env.SMTP_HOST && process.env.FEEDBACK_TO && process.env.FEEDBACK_FROM);

export const sendFeedbackEmail = async (fields: {
    message: string;
    email: string | null;
    page: string | null;
}): Promise<void> => {
    const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
    });

    const lines = [
        `Page: ${fields.page ?? 'not given'}`,
        `From: ${fields.email ?? 'not given'}`,
        '',
        fields.message,
    ];

    await transport.sendMail({
        from: process.env.FEEDBACK_FROM,
        to: process.env.FEEDBACK_TO,
        replyTo: fields.email ?? undefined,
        subject: `DFO feedback${fields.page ? ` on ${fields.page}` : ''}`,
        text: lines.join('\n'),
    });
};
