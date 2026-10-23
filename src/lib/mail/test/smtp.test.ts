/**
 * `smtp.ts`: mail leaves only over TLS. A server that offers no STARTTLS
 * gets no message, and TLS 1.2 is the floor on both kinds of connection.
 */
import assert from 'node:assert/strict';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import test from 'node:test';

import nodemailer from 'nodemailer';

import { transportOptions } from '../smtp.ts';

test('a server that offers no STARTTLS is refused before the message', async () => {
    const commands: string[] = [];
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
        sockets.add(socket);
        socket.write('220 plain.example ESMTP\r\n');
        socket.on('data', (chunk) => {
            for (const line of chunk.toString().split('\r\n').filter(Boolean)) {
                commands.push(line.split(' ')[0]!.toUpperCase());
                socket.write(
                    line.toUpperCase().startsWith('EHLO')
                        ? '250-plain.example\r\n250 8BITMIME\r\n'
                        : '250 OK\r\n',
                );
            }
        });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
        const { port } = server.address() as AddressInfo;
        const transport = nodemailer.createTransport(
            transportOptions({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port) }),
        );

        await assert.rejects(
            transport.sendMail({
                from: 'studio@example.org',
                to: 'ana@example.org',
                text: '123456',
            }),
        );
        assert.ok(commands.includes('EHLO'));
        assert.ok(!commands.includes('MAIL'));
    } finally {
        sockets.forEach((socket) => socket.destroy());
        server.close();
    }
});

test('implicit TLS when SMTP_SECURE=true; TLS 1.2 is the floor either way', () => {
    const implicit = transportOptions({ SMTP_HOST: 'smtp.example.org', SMTP_SECURE: 'true' });
    const upgraded = transportOptions({ SMTP_HOST: 'smtp.example.org' });

    assert.deepEqual(
        [implicit, upgraded].map(({ secure, requireTLS, tls }) => [
            secure,
            requireTLS,
            tls?.minVersion,
        ]),
        [
            [true, false, 'TLSv1.2'],
            [false, true, 'TLSv1.2'],
        ],
    );
});
