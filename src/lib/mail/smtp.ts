import type SMTPTransport from 'nodemailer/lib/smtp-transport';

// The SMTP transport, for local work against a mail catcher. Deployed, mail goes through the SES API instead (./ses), and ./settings picks between the two.

/**
 * The transport settings. The connection must be encrypted. SMTP_SECURE=true
 * selects implicit TLS (port 465), and otherwise STARTTLS is required and a
 * server that does not offer it is refused. Either way TLS 1.2 is the floor.
 * A sign-in code is sent while the visitor waits, so a stalled server fails
 * within 40 seconds. nodemailer's own limits run to minutes.
 */
export const transportOptions = (
    env: Record<string, string | undefined>,
): SMTPTransport.Options => {
    const secure = env.SMTP_SECURE === 'true';

    return {
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        secure,
        requireTLS: !secure,
        tls: { minVersion: 'TLSv1.2' },
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    };
};
