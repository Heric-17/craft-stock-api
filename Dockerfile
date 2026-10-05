# syntax=docker/dockerfile:1
#
# Production image, independent of any hosting platform: builds and runs
# identically via plain `docker run`, `docker compose`, or any managed
# container platform, with no provider-specific file anywhere in this repo.
#
# Node pinned to the major this project requires (package.json "engines") —
# same major-only pinning rationale already used for Postgres in
# docker-compose.yml.

# ---- deps: install all dependencies and generate the Prisma client ----
FROM node:22-alpine AS deps
# Prisma's own CLI needs OpenSSL on musl (Alpine), both to generate the
# client below and later, at runtime, to run `prisma migrate deploy`.
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# tsconfig.json has to be in place BEFORE `npm ci` below, not after: its
# postinstall runs `prisma generate`, and the generator looks up the nearest
# tsconfig to decide the import style for the client it writes. Finding
# "module": "commonjs" is what makes it emit extension-less relative imports
# (`from "./enums"`); with no tsconfig to find, it assumes an ESM/native-TS
# target instead and writes `from "./enums.ts"` — which then survives into
# the compiled dist/*.js from the build stage below verbatim, as a literal
# ".ts" require() Node cannot resolve. Reproduced and fixed against this
# exact failure while building this image; do not reorder these COPY lines.
COPY tsconfig.json ./
# `npm ci`'s postinstall runs `prisma generate`, which loads prisma.config.ts
# and needs DATABASE_URL to be SET — it is never connected to during
# generate. This placeholder never leaves the build stage; the real value
# comes from the container's runtime environment, supplied at `docker run`.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN npm ci

# ---- build: compile TypeScript to dist/ ----
FROM deps AS build
COPY tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- runtime: only what `node dist/main.js` and the entrypoint need ----
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# Full node_modules from `deps` (same Alpine/musl base, so any engine binary
# Prisma's CLI fetched is the right one) — this is what gives the entrypoint
# a working `prisma migrate deploy` at runtime, not just a slim runtime set.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
# Compiled output. The generated Prisma client lives under src/ as plain
# .ts and rides along in this same compile step — no separate copy needed.
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./

# `node` is the unprivileged user already baked into the official image
# (uid/gid 1000) — no provider-specific setup needed to run as non-root.
USER node

EXPOSE 3000

# Liveness only, matching /health itself (see HealthController): proves the
# process is up, not that the database is reachable or the schema is current.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" || exit 1

# Boot sequence: the schema is brought up to date BEFORE the API process
# ever starts accepting traffic, never the other way around (see
# "Implantação" in README.md for why this runs here, at container startup,
# instead of as a separate pipeline step or a manual command). `set -e`
# (via `;` after it) is what makes this safe — if `prisma migrate deploy`
# fails, the shell stops right there and `exec node dist/main.js` never
# runs, so the container exits non-zero instead of serving traffic against
# a stale or partially-applied schema. The trailing `exec` replaces the
# shell with the node process (PID 1), so it receives shutdown signals
# directly instead of through an intermediary.
ENTRYPOINT ["sh", "-c", "set -e; \
  echo '[entrypoint] applying pending migrations (prisma migrate deploy)...'; \
  npm run prisma:deploy; \
  echo '[entrypoint] migrations applied, starting the API...'; \
  exec node dist/main.js"]
