/**
 * `settings.ts`: the three SES settings select the SES API and win over
 * SMTP_HOST, part of them turns mail off and names the rest, and SMTP_HOST
 * alone selects SMTP.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { mailTransport } from '../settings.ts';

const ROLE = 'arn:aws:iam::123456789012:role/dfo-website-dev-ses';
const AUDIENCE = 'dfo-website-staging';
const SES = { SES_ROLE_ARN: ROLE, SES_REGION: 'us-east-1', SES_TOKEN_AUDIENCE: AUDIENCE };
const SELECTED = { kind: 'ses', roleArn: ROLE, region: 'us-east-1', tokenAudience: AUDIENCE };

for (const [name, env, expected] of [
    ['SES settings', { ...SES, SES_ROLE_ARN: ` ${ROLE} ` }, SELECTED],
    [
        'SES without region',
        { ...SES, SES_REGION: undefined, SMTP_HOST: 'localhost' },
        { missing: ['SES_REGION'] },
    ],
    ['SES without role', { ...SES, SES_ROLE_ARN: ' ' }, { missing: ['SES_ROLE_ARN'] }],
    [
        'SES without audience',
        { ...SES, SES_TOKEN_AUDIENCE: '', SMTP_HOST: 'localhost' },
        { missing: ['SES_TOKEN_AUDIENCE'] },
    ],
    ['SES role only', { SES_ROLE_ARN: ROLE }, { missing: ['SES_REGION', 'SES_TOKEN_AUDIENCE'] }],
    ['SMTP only', { SMTP_HOST: 'localhost' }, { kind: 'smtp' }],
    ['SES settings and SMTP', { ...SES, SMTP_HOST: 'localhost' }, SELECTED],
    [
        'nothing',
        { SMTP_HOST: '' },
        { missing: ['SES_ROLE_ARN/SES_REGION/SES_TOKEN_AUDIENCE or SMTP_HOST'] },
    ],
] as const) {
    test(`mail transport: ${name}`, () => {
        assert.deepEqual(mailTransport(env), expected);
    });
}
