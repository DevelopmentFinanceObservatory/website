/**
 * `settings.ts`: the SES pair selects the SES API and wins over SMTP_HOST,
 * half of the pair turns mail off and names the other half, and SMTP_HOST
 * alone selects SMTP.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { mailTransport } from '../settings.ts';

const ROLE = 'arn:aws:iam::123456789012:role/dfo-website-dev-ses';

for (const [name, env, expected] of [
    [
        'SES pair',
        { SES_ROLE_ARN: ` ${ROLE} `, SES_REGION: 'us-east-1' },
        { kind: 'ses', roleArn: ROLE, region: 'us-east-1' },
    ],
    [
        'SES without region',
        { SES_ROLE_ARN: ROLE, SMTP_HOST: 'localhost' },
        { missing: ['SES_REGION'] },
    ],
    [
        'SES without role',
        { SES_REGION: 'us-east-1', SES_ROLE_ARN: ' ' },
        { missing: ['SES_ROLE_ARN'] },
    ],
    ['SMTP only', { SMTP_HOST: 'localhost' }, { kind: 'smtp' }],
    [
        'SES pair and SMTP',
        { SES_ROLE_ARN: ROLE, SES_REGION: 'us-east-1', SMTP_HOST: 'localhost' },
        { kind: 'ses', roleArn: ROLE, region: 'us-east-1' },
    ],
    ['nothing', { SMTP_HOST: '' }, { missing: ['SES_ROLE_ARN/SES_REGION or SMTP_HOST'] }],
] as const) {
    test(`mail transport: ${name}`, () => {
        assert.deepEqual(mailTransport(env), expected);
    });
}
