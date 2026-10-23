/**
 * `ses.ts` through `send.ts`, against a local server answering as AWS STS
 * and the SES v2 API. Two sends cost one ID token and one STS exchange, and
 * each SES request is signed with the STS-issued credentials for the
 * configured region.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { createSendMail } from '../send.ts';
import { ROLE_SESSION_NAME } from '../ses.ts';

const ROLE = 'arn:aws:iam::123456789012:role/dfo-website-dev-ses';
const REGION = 'eu-west-2';
const AUDIENCE = 'dfo-website-staging';
const ACCESS_KEY_ID = 'ASIAEXAMPLESTS';
const SESSION_TOKEN = 'session-token-from-sts';
const FROM = 'studio@developmentfinance.org';

const stsAnswer = (
    expiration: Date,
) => `<AssumeRoleWithWebIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleWithWebIdentityResult>
    <Credentials>
      <AccessKeyId>${ACCESS_KEY_ID}</AccessKeyId>
      <SecretAccessKey>secret-from-sts</SecretAccessKey>
      <SessionToken>${SESSION_TOKEN}</SessionToken>
      <Expiration>${expiration.toISOString()}</Expiration>
    </Credentials>
    <AssumedRoleUser>
      <Arn>arn:aws:sts::123456789012:assumed-role/dfo-website-dev-ses/${ROLE_SESSION_NAME}</Arn>
      <AssumedRoleId>AROAEXAMPLE:${ROLE_SESSION_NAME}</AssumedRoleId>
    </AssumedRoleUser>
  </AssumeRoleWithWebIdentityResult>
  <ResponseMetadata><RequestId>sts-request</RequestId></ResponseMetadata>
</AssumeRoleWithWebIdentityResponse>`;

test('two sends: one ID token, one STS exchange, and SES requests signed with its credentials', async () => {
    const stsCalls: URLSearchParams[] = [];
    const sesCalls: { path: string; headers: Record<string, unknown>; body: unknown }[] = [];
    const server = createServer((request, response) => {
        let body = '';

        request.on('data', (chunk) => (body += chunk));
        request.on('end', () => {
            if (request.url === '/') {
                stsCalls.push(new URLSearchParams(body));
                response.setHeader('content-type', 'text/xml');
                response.end(stsAnswer(new Date(Date.now() + 3_600_000)));

                return;
            }

            sesCalls.push({
                path: request.url ?? '',
                headers: request.headers,
                body: JSON.parse(body),
            });
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ MessageId: `message-${sesCalls.length}` }));
        });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
        const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const audiences: string[] = [];
        const sendMail = createSendMail(
            {
                SES_ROLE_ARN: ROLE,
                SES_REGION: REGION,
                SES_TOKEN_AUDIENCE: AUDIENCE,
                SMTP_HOST: 'smtp.example.org',
            },
            {
                idToken: async (audience) => {
                    audiences.push(audience);

                    return 'google-id-token';
                },
                stsEndpoint: endpoint,
                sesEndpoint: endpoint,
            },
        );

        for (const to of ['ana@one.org', 'ben@one.org']) {
            await sendMail({ from: `DFO Studio <${FROM}>`, to, subject: 'Code', text: '123456' });
        }

        assert.deepEqual(audiences, [AUDIENCE]);
        assert.deepEqual(
            stsCalls.map((params) => [
                params.get('Action'),
                params.get('RoleArn'),
                params.get('WebIdentityToken'),
                params.get('RoleSessionName'),
            ]),
            [['AssumeRoleWithWebIdentity', ROLE, 'google-id-token', ROLE_SESSION_NAME]],
        );
        assert.equal(sesCalls.length, 2);

        for (const { path, headers, body } of sesCalls) {
            const { FromEmailAddress, Content } = body as {
                FromEmailAddress?: string;
                Content?: { Raw?: { Data?: string } };
            };
            const raw = Buffer.from(Content?.Raw?.Data ?? '', 'base64').toString();

            assert.equal(path, '/v2/email/outbound-emails');
            assert.match(
                String(headers.authorization),
                new RegExp(
                    `^AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/\\d{8}/${REGION}/ses/aws4_request,`,
                ),
            );
            assert.equal(headers['x-amz-security-token'], SESSION_TOKEN);
            assert.match(FromEmailAddress ?? '', new RegExp(FROM));
            assert.match(raw, new RegExp(`^From: DFO Studio <${FROM}>\\r$`, 'm'));
        }
    } finally {
        server.close();
    }
});

test('an SES request that never answers fails the send after two attempts', async () => {
    const sesCalls: string[] = [];
    const server = createServer((request, response) => {
        let body = '';

        request.on('data', (chunk) => (body += chunk));
        request.on('end', () => {
            if (request.url === '/') {
                response.setHeader('content-type', 'text/xml');
                response.end(stsAnswer(new Date(Date.now() + 3_600_000)));

                return;
            }

            // Accepted and left unanswered.
            sesCalls.push(request.url ?? '');
        });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
        const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const sendMail = createSendMail(
            { SES_ROLE_ARN: ROLE, SES_REGION: REGION, SES_TOKEN_AUDIENCE: AUDIENCE },
            {
                idToken: async () => 'google-id-token',
                stsEndpoint: endpoint,
                sesEndpoint: endpoint,
                requestTimeout: 200,
            },
        );

        // Without a request timeout the send would wait for ever, so the
        // test gives up after two seconds and reports that.
        const outcome = await Promise.race([
            sendMail({ from: FROM, to: 'ana@one.org', subject: 'Code', text: '123456' }).then(
                () => 'sent',
                (error: unknown) => (error instanceof Error ? error.name : 'rejected'),
            ),
            delay(2_000, 'still waiting', { ref: false }),
        ]);

        assert.equal(outcome, 'TimeoutError');
        assert.equal(sesCalls.length, 2);
    } finally {
        server.closeAllConnections();
        server.close();
    }
});
