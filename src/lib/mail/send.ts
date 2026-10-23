import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';

import { mailTransport } from './settings.ts';
import { sesTransport, type SesDeps } from './ses.ts';
import { transportOptions } from './smtp.ts';

type Env = Record<string, string | undefined>;

const buildTransport = (env: Env, deps: SesDeps): Transporter => {
    const transport = mailTransport(env);

    if ('missing' in transport) {
        throw new Error(`mail is off: ${transport.missing.join(', ')} unset`);
    }

    return transport.kind === 'ses'
        ? sesTransport(transport, deps)
        : nodemailer.createTransport(transportOptions(env));
};

/**
 * A sender over the transport `env` selects (see ./settings), built on the
 * first send and kept, so the SES transport's AWS credentials outlive one
 * message. `deps` exist for tests.
 */
export const createSendMail = (
    env: Env,
    deps: SesDeps = {},
): ((message: SendMailOptions) => Promise<void>) => {
    let transport: Transporter | undefined;

    return async (message) => {
        transport ??= buildTransport(env, deps);
        await transport.sendMail(message);
    };
};

/** Sends one message over the site's transport, read from process.env on the first send. */
export const sendMail = createSendMail(process.env);
