import * as Sentry from '@sentry/nextjs';

/**
 * Runs once per server instance, before it serves its first request (see
 * node_modules/next/dist/docs/01-app/02-guides/instrumentation.md). This is
 * where the runtime's Cloud SQL connection gets set up -- never at module
 * import, so `next build` (NODE_ENV=production, no DB env at all) never
 * throws.
 *
 * `register()` runs in every runtime Next.js supports; the connector is
 * Node-only, so everything below is gated on NEXT_RUNTIME and the node-only
 * module is imported dynamically inside that branch, per the docs' guidance
 * on importing runtime-specific code.
 */
export async function register(): Promise<void> {
    // Sentry first, whichever runtime — it has to be up before anything it
    // should catch (the Cloud SQL setup below included).
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config');
    }

    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }

    await import('../sentry.server.config');

    const { assertTrustedHops } = await import('./lib/proxy/caller');

    try {
        assertTrustedHops(process.env);
    } catch (error) {
        // A malformed TRUSTED_PROXY_HOPS would key every client's rate limit
        // and caller digest wrongly; refuse to start in production. In dev
        // the per-call handling in lib/proxy/caller logs it instead.
        if (process.env.NODE_ENV === 'production') {
            throw error;
        }

        console.warn(error instanceof Error ? error.message : String(error));
    }

    const { searchApiBase } = await import('./lib/searchApi');

    try {
        searchApiBase();
    } catch (error) {
        // Without it every search, datasets and graph call fails, so a
        // production server refuses to start. In dev those calls throw the
        // same error at first use.
        if (process.env.NODE_ENV === 'production') {
            throw error;
        }

        console.warn(error instanceof Error ? error.message : String(error));
    }

    const { resolveRuntimeConnection, connectCloudSqlRuntime, setCloudSqlRuntimeStream } =
        await import('../db/connection');

    let connection;

    try {
        connection = resolveRuntimeConnection();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // A misconfigured production deploy should fail to start rather
        // than serve requests that can never reach a database. In dev,
        // throwing here would kill `next dev`'s server on every reload, so
        // warn and let src/lib/db/index.ts's pool fail requests instead.
        if (process.env.NODE_ENV === 'production') {
            throw error;
        }

        console.warn(
            `[db] ${message} -- requests that touch the database will fail until this is fixed.`,
        );
        return;
    }

    if (connection.kind !== 'cloud-sql') {
        return;
    }

    const { stream } = await connectCloudSqlRuntime(connection);
    setCloudSqlRuntimeStream(stream);
}

// Server-side render/route errors, reported with the request they broke.
export const onRequestError = Sentry.captureRequestError;
