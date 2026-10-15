# syntax=docker/dockerfile:1
#
# Cloud Run image for the DFO website: the Next.js app in standalone output
# mode (next.config.ts sets `output: 'standalone'`, per the conventions in
# docs/development.md).
#
# Build from the REPO ROOT, not from deploy/:
#
#   docker buildx build -f deploy/Dockerfile -t <image> .

FROM node:24-slim AS builder

# Pinned to package.json's packageManager version so this build and CI's
# pnpm/action-setup (which reads that field) can't drift.
RUN npm install -g pnpm@10.5.2

WORKDIR /app

# Manifest + lockfile first, so the dependency layer caches across
# source-only changes.
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Bundled separately from the Next.js build. Standalone output only traces
# and copies files reachable from a route handler, and the migrate
# entrypoint (db/migrate.ts) is a Cloud Run Job command outside the request
# path, so no route handler imports it and tracing misses it. esbuild
# inlines every dependency (pg, drizzle-orm, the Cloud SQL connector) into
# one file, so the runtime stage below needs no node_modules for it at all,
# pruned or otherwise.
RUN pnpm run build:migrate

FROM node:24-slim AS runtime

# node:24-slim already ships a `node` user at UID 1000, so let useradd pick
# a free system UID rather than asking for one that is taken.
RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --no-create-home app

WORKDIR /app

# Standalone output bundles the server and the pruned node_modules. Static
# assets and public/ are served by that same server but emitted separately.
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

# The migration Job's `command` override, set once in the Job's own
# Terraform definition, runs this instead of server.js. Both the bundle
# and the raw .sql files travel here: readMigrationFiles (drizzle-orm) reads
# the migrations folder off disk at runtime, so it isn't inlined into the
# bundle.
COPY --from=builder --chown=app:app /app/dist/migrate.cjs ./dist/migrate.cjs
COPY --from=builder --chown=app:app /app/db/migrations ./db/migrations

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

USER app
EXPOSE 8080

# Cloud Run sets $PORT at runtime. The standalone server reads PORT and
# HOSTNAME from the environment.
CMD ["node", "server.js"]
