# DFO Website — Developer Commands
# Run 'just' or 'just --list' to see all available targets.
#
# Override defaults from the command line:
#   just LOG_LIMIT=200 logs
#   just RUN_PORT=9090 run-local

# Configuration (override any of these from the command line)
IMAGE      := "dfo-website:local"
DOCKERFILE := "deploy/Dockerfile"
ENV_FILE   := ".env.local"
ENV_SAMPLE := ".env.example"
PORT       := "3000"       # dev server port
RUN_PORT   := "8080"       # host port for run-local; the container always listens on 8080
PROJECT_ID := "dev-fin-observatory"
REGION     := "northamerica-northeast1"
AR_REPO    := "dfo-website-staging"
SERVICE    := env_var_or_default("SERVICE", "dfo-dev-website-staging")
LOG_LIMIT  := "50"         # log lines `logs` reads
GCP_ADC    := env_var("HOME") / ".config/gcloud/application_default_credentials.json"

# Show available commands (default)
_default:
    @just --list --unsorted

# ── Setup & Configuration ─────────────────────────────

# Not --frozen-lockfile: a developer adding a dependency needs the lockfile
# to move, not to be blocked by it.
#
# Install dependencies and create the local env file
setup: env
    #!/usr/bin/env bash
    set -euo pipefail
    pnpm install
    echo "Setup complete. Run 'just dev' to start."

# No Secret Manager round-trip here — this repo's sample holds no secrets.
#
# Create the local env file, if it doesn't already exist
env:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f "{{ENV_FILE}}" ]; then
        echo "{{ENV_FILE}} already exists."
    else
        cp "{{ENV_SAMPLE}}" "{{ENV_FILE}}"
        echo "ok Created {{ENV_FILE}} from {{ENV_SAMPLE}}."
    fi

# ── Development ───────────────────────────────────────

# LAN access (phone/tablet testing) needs DEV_ORIGINS set in {{ENV_FILE}}.
#
# Run the dev server (Turbopack)
dev:
    @echo "http://localhost:{{PORT}}"
    pnpm dev --port {{PORT}}

# Needs 'just build' first -- this serves the production build, it doesn't
# create one. Next warns that `next start` does not work with
# `output: 'standalone'` (which next.config.ts sets); it serves locally
# anyway because the full .next build is on disk, but the faithful check of
# what Cloud Run actually runs is 'just docker-build' then 'just run-local'.
#
# Serve the production build on the host
start:
    pnpm start

# Run after adding an SVG to src/assets/svg (see docs/development.md).
# Hyphenated because just recipe names cannot contain a colon.
#
# Optimize SVGs with SVGO
optimize-svg:
    pnpm optimize:svg

# ── Database ───────────────────────────────────────────

# Same postgres:18.4 image CI's service container runs, so migrations that
# pass here pass there. Idempotent: a container from a prior `db-up`
# (stopped or already running) is started rather than recreated, so
# re-running this never loses the local database's data. The wait loop
# covers the container's first-ever start, when initdb hasn't finished and
# an immediate `db-migrate` would hit connection refused.
#
# POSTGRES_PASSWORD is a fixed, throwaway local superuser password, never
# used outside this container -- see db/migrate-local.ts for the
# migrator/runtime role passwords it goes on to create.
#
# The container listens on 5433 so it doesn't clash with a Postgres
# installed on the machine, which takes 5432. PGPORT overrides it;
# db-migrate and the tests read the same variable. The port is fixed when
# the container is created, so changing it needs `db-reset`.
#
# Start the local Postgres container (create it on first run)
db-up:
    #!/usr/bin/env bash
    set -euo pipefail
    port="${PGPORT:-5433}"
    if docker inspect dfo-website-db >/dev/null 2>&1; then
        docker start dfo-website-db >/dev/null
        current=$(docker port dfo-website-db 5432/tcp | head -1 | awk -F: '{print $NF}')
        echo "ok Started existing dfo-website-db container (port 127.0.0.1:$current)."
        if [ "$current" != "$port" ]; then
            echo "warn The container is on port $current, not $port. Run '${PGPORT:+PGPORT=$port }just db-reset' to recreate it." >&2
        fi
    else
        docker run -d --name dfo-website-db -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:$port:5432" postgres:18.4 >/dev/null
        echo "ok Created dfo-website-db container (postgres:18.4, port 127.0.0.1:$port)."
    fi
    for _ in $(seq 1 30); do
        if docker exec dfo-website-db pg_isready -U postgres >/dev/null 2>&1; then
            exit 0
        fi
        sleep 1
    done
    echo "Error: dfo-website-db did not become ready within 30s." >&2
    exit 1

# Sets up the migrator/runtime roles (db/local-roles.ts) and applies every
# migration through the same runner (db/apply-migrations.ts) the deployed
# Job uses. Idempotent -- see db/migrate-local.ts.
#
# Apply migrations to the local database
db-migrate:
    pnpm db:migrate:local

# For when the local database is in a state not worth debugging --
# mismatched roles from an old branch, a botched manual grant. Removing the
# container drops its data with it (no volume is mounted), so this is
# `db-up` from scratch plus a fresh `db-migrate`, not a targeted fix.
#
# Drop and recreate the local Postgres container, then reapply migrations
db-reset:
    #!/usr/bin/env bash
    set -euo pipefail
    docker rm -f dfo-website-db >/dev/null 2>&1 || true
    just db-up
    just db-migrate

# Run after editing db/schema.ts (see docs/development.md's schema change
# workflow) -- review the generated SQL before `db-migrate` applies it.
#
# Generate a migration from db/schema.ts changes
db-generate:
    pnpm db:generate

# ── Quality ────────────────────────────────────────────

# Superset of the npm 'lint' script: ESLint plus Stylelint (SCSS)
lint:
    pnpm lint
    pnpm lint:css

# Write-only: applies Prettier and Stylelint fixes in place
format:
    pnpm format
    pnpm lint:css:fix

# Type-check with tsc --noEmit
typecheck:
    pnpm typecheck

# Needs a reachable Postgres 18 -- CI provides one as a service container;
# locally, run `just db-up` first.
#
# Run migration integration tests
test:
    pnpm test

# Production build (standalone output)
build:
    pnpm build

# src/lib/graph/test/wire.test.ts fails until the committed types match the
# snapshot; the diff of this regeneration is the review artifact.
#
# Rewrite src/lib/graph/schema.d.ts from the Graph API schema snapshot
graph-types:
    pnpm graph:types

# Reads `GET /api/graph/schema` from the given dfo-apis, dev by default.
#
# Refresh the Graph API schema snapshot from a deployed dfo-apis, then the types
graph-schema url="https://dfo-dev-apis-zms5lj4zhq-nn.a.run.app":
    pnpm graph:schema {{url}}

# Everything ci.yml runs, in CI's order. Green here means green there.
check: lint typecheck test build

# ── Container ──────────────────────────────────────────

# Build from the repo root — the Dockerfile requires it. The linux/amd64
# image runs under emulation locally, so this is slow.
#
# Build the Cloud Run image
docker-build:
    docker buildx build --platform linux/amd64 --provenance=false --load --tag {{IMAGE}} -f {{DOCKERFILE}} .

# Cloud Run's filesystem is a writable in-memory overlay, and next/image
# writes optimized variants under .next/cache/images at request time, which
# the standalone image doesn't ship — so a read-only run breaks on the first
# image request. No --read-only, no --tmpfs.
#
# -i, not -it: -t asks Docker to allocate a pseudo-TTY, which fails outright
# ("the input device is not a TTY") the moment this runs without a real
# terminal attached -- backgrounded, from a script, or from CI. -i alone
# keeps stdin open (so Ctrl+C still stops it in a real terminal) without
# that requirement.
#
# Run the built image locally
run-local:
    #!/usr/bin/env bash
    set -euo pipefail
    args=(--rm -i --init -p {{RUN_PORT}}:8080)
    if [ -f "{{ENV_FILE}}" ]; then args+=(--env-file "{{ENV_FILE}}"); fi
    echo "container -> http://localhost:{{RUN_PORT}}"
    docker run "${args[@]}" {{IMAGE}}

# Doesn't touch buildx's layer cache -- just the build output and the local
# tag, so a stale .next or an old {{IMAGE}} never gets mistaken for current.
# tsconfig.json sets "incremental": true, so a stale *.tsbuildinfo is its own
# cause of a typecheck that passes here and fails in CI.
#
# Remove build output, the incremental typecheck cache, and the local image
clean:
    #!/usr/bin/env bash
    set -euo pipefail
    rm -rf .next *.tsbuildinfo
    docker rmi {{IMAGE}} >/dev/null 2>&1 || true
    echo "Cleaned."

# ── Diagnostics ────────────────────────────────────────

# Show branch, remote, built images, and env file status
status:
    #!/usr/bin/env bash
    echo "Git branch:"
    git branch --show-current
    echo ""
    echo "Remote:"
    git remote -v
    echo ""
    echo "Docker images:"
    docker images | grep -E "dfo-website|REPOSITORY" || echo "  (none found)"
    echo ""
    echo "Env file:"
    if [ -f "{{ENV_FILE}}" ]; then echo "  ok {{ENV_FILE}}"; else echo "  missing {{ENV_FILE}} (run 'just env')"; fi

# Check the local environment: tooling, node_modules, pnpm version
doctor:
    #!/usr/bin/env bash
    echo "Tooling:"
    for tool in node pnpm docker git gcloud; do
        if command -v "$tool" >/dev/null 2>&1; then
            echo "  ok    $tool"
        else
            echo "  MISS  $tool"
        fi
    done
    echo ""
    if [ -d node_modules ]; then
        echo "  ok    node_modules present"
    else
        echo "  MISS  node_modules -- run 'just setup'"
    fi
    echo ""
    # ci.yml's pnpm/action-setup and deploy/Dockerfile both pin to package.json's
    # packageManager field, so a local mismatch is worth flagging on its own.
    want=$(node -p "require('./package.json').packageManager.split('@')[1]")
    have=$(pnpm --version 2>/dev/null || true)
    if [ "$have" = "$want" ]; then
        echo "  ok    pnpm $have matches package.json"
    else
        echo "  MISS  pnpm $have, package.json wants $want"
    fi
    # The db scripts and tests run .ts files directly, which Node supports
    # without a flag from 22.18.
    if node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)' 2>/dev/null; then
        echo "  ok    node $(node --version) (>= 22.18)"
    else
        echo "  MISS  node $(node --version 2>/dev/null), need >= 22.18"
    fi

# The one command nobody types right from memory. Override the service with
# 'just SERVICE=... logs', the line count with 'just LOG_LIMIT=200 logs'.
# ARGS goes to gcloud for anything else -- pass the count through LOG_LIMIT
# rather than a second --limit, which would leave gcloud two of them.
#
# Tail recent Cloud Run logs
logs *ARGS: _check-gcloud
    gcloud run services logs read {{SERVICE}} --project {{PROJECT_ID}} --region {{REGION}} --limit {{LOG_LIMIT}} {{ARGS}}

# Answers "which image is actually live right now" -- the question you ask
# after a merge. Reads latestReadyRevisionName rather than a condition by
# array position: the order of status.conditions is not part of the API
# contract, so indexing into it can silently report the wrong condition.
#
# Show the live service's URL, serving revision, and image
deployed: _check-gcloud
    gcloud run services describe {{SERVICE}} --project {{PROJECT_ID}} --region {{REGION}} \
        --format="value(status.url, status.latestReadyRevisionName, spec.template.spec.containers[0].image)"

# ── Deploy config ──────────────────────────────────────

# REGION/PROJECT_ID/AR_REPO are static constants this repo owns, kept in git
# rather than typed into the GitHub UI. infra pushes SERVICE_WEBSITE,
# WIF_PROVIDER, and WIF_SA itself. See deploy/README.md for the full division.
#
# Set REGION/PROJECT_ID/AR_REPO on the dev GitHub Environment
set-dev-deploy-vars repo='DevelopmentFinanceObservatory/website':
    gh variable set REGION     --env dev --repo {{repo}} --body {{REGION}}
    gh variable set PROJECT_ID --env dev --repo {{repo}} --body {{PROJECT_ID}}
    gh variable set AR_REPO    --env dev --repo {{repo}} --body {{AR_REPO}}

# Production is a promotion of an already-built image. TAG is the full git
# SHA a dev deploy already pushed, and it must already be on main.
#
# Trigger deploy-prod.yml for an already-built image
deploy-prod TAG:
    gh workflow run deploy-prod.yml -f image_tag={{TAG}}

# ── Internal ───────────────────────────────────────────

# An ACTIVE account and a present ADC file are not proof either one still
# works -- a stale account still shows ACTIVE, and the ADC file survives an
# expired refresh token. print-access-token forces the real check: it
# refreshes (or fails) against Google, so an expired credential is caught
# here instead of surfacing as a confusing failure three lines into a real
# command. The ADC check stays presence-only -- verifying it live would cost
# a second network round trip on every gated recipe for a credential that
# expires far less often than the user account's.
_check-gcloud:
    #!/usr/bin/env bash
    if ! gcloud auth print-access-token >/dev/null 2>&1; then
        echo "Error: no working gcloud credentials (none active, or the token needs a"
        echo "refresh). Run 'gcloud auth login'."
        exit 1
    fi
    if [ ! -f "{{GCP_ADC}}" ]; then
        echo "Error: GCP Application Default Credentials not found."
        echo "Run 'gcloud auth application-default login'."
        exit 1
    fi
