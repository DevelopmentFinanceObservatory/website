import assert from 'node:assert/strict';
import test from 'node:test';
import { isCloudSqlConfigured, resolveRuntimeConnection } from '../connection.ts';

/**
 * Pure resolver logic only -- no DB needed. Cloud SQL over PSC can't be
 * exercised locally at all, so this is the only automated coverage
 * `resolveRuntimeConnection` gets; everything else is staging soak after
 * merge.
 */
test('resolveRuntimeConnection', async (t) => {
    await t.test('returns the cloud-sql kind when fully configured', () => {
        const connection = resolveRuntimeConnection({
            WEBSITE_DB_INSTANCE_CONNECTION_NAME: 'project:region:instance',
            WEBSITE_DB_USER: 'runtime-sa@project.iam',
            WEBSITE_DB_NAME: 'website',
        });

        assert.deepEqual(connection, {
            kind: 'cloud-sql',
            instanceConnectionName: 'project:region:instance',
            user: 'runtime-sa@project.iam',
            database: 'website',
        });
    });

    await t.test('returns the url kind when only DATABASE_URL is set', () => {
        const connection = resolveRuntimeConnection({
            DATABASE_URL: 'postgres://website_runtime:password@localhost:5432/website',
        });

        assert.deepEqual(connection, {
            kind: 'url',
            connectionString: 'postgres://website_runtime:password@localhost:5432/website',
        });
    });

    await t.test('prefers cloud-sql when both are set', () => {
        const connection = resolveRuntimeConnection({
            WEBSITE_DB_INSTANCE_CONNECTION_NAME: 'project:region:instance',
            WEBSITE_DB_USER: 'runtime-sa@project.iam',
            WEBSITE_DB_NAME: 'website',
            DATABASE_URL: 'postgres://website_runtime:password@localhost:5432/website',
        });

        assert.equal(connection.kind, 'cloud-sql');
    });

    await t.test('throws naming the missing var(s) when cloud-sql config is partial', () => {
        assert.throws(
            () =>
                resolveRuntimeConnection({
                    WEBSITE_DB_INSTANCE_CONNECTION_NAME: 'project:region:instance',
                }),
            /WEBSITE_DB_USER, WEBSITE_DB_NAME/,
        );

        assert.throws(
            () =>
                resolveRuntimeConnection({
                    WEBSITE_DB_INSTANCE_CONNECTION_NAME: 'project:region:instance',
                    WEBSITE_DB_USER: 'runtime-sa@project.iam',
                }),
            /WEBSITE_DB_NAME/,
        );
    });

    await t.test('throws when neither cloud-sql nor DATABASE_URL is configured', () => {
        assert.throws(
            () => resolveRuntimeConnection({}),
            /WEBSITE_DB_INSTANCE_CONNECTION_NAME|DATABASE_URL/,
        );
    });
});

test('isCloudSqlConfigured', async (t) => {
    await t.test('is true whenever the instance var is set, even with a partial config', () => {
        assert.equal(
            isCloudSqlConfigured({
                WEBSITE_DB_INSTANCE_CONNECTION_NAME: 'project:region:instance',
            }),
            true,
        );
    });

    await t.test('is false otherwise', () => {
        assert.equal(isCloudSqlConfigured({}), false);
        assert.equal(
            isCloudSqlConfigured({ DATABASE_URL: 'postgres://localhost:5432/website' }),
            false,
        );
    });
});
