/**
 * `emailSignIn.ts`: email sign-in stays off unless mail and the Turnstile
 * check are both configured, throwaway domains (and their subdomains) are
 * refused, and the email carries the code with nothing to click.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { emailSignInConfig, isThrowawayAddress, signInCodeMessage } from '../emailSignIn.ts';

const FULL = {
    SES_ROLE_ARN: 'arn:aws:iam::123456789012:role/dfo-website-dev-ses',
    SES_REGION: 'us-east-1',
    SES_TOKEN_AUDIENCE: 'dfo-website-staging',
    AUTH_EMAIL_FROM: ' DFO Studio <studio@developmentfinance.org> ',
    TURNSTILE_SITE_KEY: 'site-key',
    TURNSTILE_SECRET_KEY: 'secret-key',
};

test('every setting present: on, with values trimmed', () => {
    assert.deepEqual(emailSignInConfig(FULL), {
        from: 'DFO Studio <studio@developmentfinance.org>',
        turnstileSiteKey: 'site-key',
        turnstileSecretKey: 'secret-key',
    });
});

for (const name of Object.keys(FULL)) {
    test(`${name} unset or blank: off, and named as missing`, () => {
        assert.deepEqual(emailSignInConfig({ ...FULL, [name]: undefined }), { missing: [name] });
        assert.deepEqual(emailSignInConfig({ ...FULL, [name]: '  ' }), { missing: [name] });
    });
}

test('no mail transport and no From address: off, with both named', () => {
    const env = {
        ...FULL,
        SES_ROLE_ARN: undefined,
        SES_REGION: undefined,
        SES_TOKEN_AUDIENCE: undefined,
        AUTH_EMAIL_FROM: undefined,
    };

    assert.deepEqual(emailSignInConfig(env), {
        missing: ['SES_ROLE_ARN/SES_REGION/SES_TOKEN_AUDIENCE or SMTP_HOST', 'AUTH_EMAIL_FROM'],
    });
});

for (const [email, throwaway] of [
    ['someone@mailinator.com', true],
    ['someone@MAILINATOR.COM', true],
    ['someone@inbox.mailinator.com', true],
    ['someone@mailinator.com.example.org', false],
    ['someone@gmail.com', false],
    ['someone@one.org', false],
    ['someone@finance.gov.gh', false],
] as const) {
    test(`isThrowawayAddress(${email}) is ${throwaway}`, () => {
        assert.equal(isThrowawayAddress(email), throwaway);
    });
}

test('the email carries the code in subject, text and HTML, and no link', () => {
    const message = signInCodeMessage('482913');

    assert.match(message.subject, /482913/);
    assert.match(message.text, /482913/);
    assert.match(message.html, /482913/);
    assert.doesNotMatch(message.text + message.html, /https?:|href=/);
});
