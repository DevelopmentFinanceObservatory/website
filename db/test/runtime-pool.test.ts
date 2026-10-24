import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { DriverOptions } from '@google-cloud/cloud-sql-connector';
import {
    buildRuntimePool,
    getCloudSqlRuntimeStream,
    setCloudSqlRuntimeStream,
} from '../connection.ts';

/**
 * Stands in for the real Cloud SQL TLS socket `connectCloudSqlRuntime`'s
 * connector would return. `pg`'s `Connection` calls `setNoDelay`/`connect`
 * on whatever `stream()` gives it and defaults `host`/`port` to
 * `localhost:5432` when neither is set on the pool config -- so a bare,
 * unconnected `net.Socket` would silently dial this machine's real local
 * Postgres instead of proving the fake factory was actually used. This
 * fake never touches the network at all: `connect()` schedules an
 * immediate error instead of dialing anything, which is enough for
 * `pg.Pool.connect()` to reject.
 */
class FakeCloudSqlSocket extends EventEmitter {
    writable = true;

    setNoDelay(): this {
        return this;
    }

    setKeepAlive(): this {
        return this;
    }

    connect(): this {
        queueMicrotask(() =>
            this.emit('error', new Error('fake Cloud SQL socket: no real connection')),
        );
        return this;
    }

    write(_chunk: unknown, callback?: (error?: Error) => void): boolean {
        callback?.();
        return true;
    }

    end(): this {
        return this;
    }

    destroy(): this {
        return this;
    }

    ref(): this {
        return this;
    }

    unref(): this {
        return this;
    }
}

/**
 * Exercises the handoff `db/connection.ts`'s doc comments describe but no
 * other test reaches: `instrumentation.ts`'s `register()` storing a stream
 * factory on globalThis, then `buildRuntimePool` (the same builder
 * src/lib/db/index.ts calls) reading it back through
 * `getCloudSqlRuntimeStream` when pg actually opens a connection. No real
 * Cloud SQL instance or database is needed -- only that the registered
 * factory gets called when pg dials out.
 *
 * Runs in one process (`node --test` gives each file its own), and in a
 * fixed order (node:test runs a file's top-level tests sequentially by
 * default): the "nothing registered" case first, then the case that
 * registers a stream, so neither depends on resetting globalThis between
 * them.
 */
test('getCloudSqlRuntimeStream throws a clear error before anything is registered', () => {
    assert.throws(
        () => getCloudSqlRuntimeStream(),
        /instrumentation\.ts's register\(\).+export-events\.ts's main\(\) must set it/,
    );
});

test('buildRuntimePool wires the Cloud SQL path to the registered stream factory', async (t) => {
    let callCount = 0;
    const fakeStream: DriverOptions['stream'] = () => {
        callCount += 1;
        return new FakeCloudSqlSocket() as unknown as Socket;
    };

    setCloudSqlRuntimeStream(fakeStream);

    const pool = buildRuntimePool({
        WEBSITE_DB_INSTANCE_CONNECTION_NAME: 'project:region:instance',
        WEBSITE_DB_USER: 'runtime-sa@project.iam',
        WEBSITE_DB_NAME: 'website',
    });
    t.after(() => pool.end());

    await assert.rejects(() => pool.connect());
    assert.equal(callCount, 1);
});
