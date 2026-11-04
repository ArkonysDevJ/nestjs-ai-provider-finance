# API image (apps/api). Build from the repository root:
#   docker build -t finance-api .
# railway.json pins the NIXPACKS builder, so this file has no effect on the
# current deployment until the builder is switched on purpose.

# Pinned to the exact patch that carries the October 2026 security fixes, so
# the runtime only changes when this line does. Debian slim over Alpine: the
# official Node release binaries target glibc, while Alpine images run an
# unofficial musl build of Node.
ARG NODE_IMAGE=node:24.22.1-slim

# --- Stage 1: build -----------------------------------------------------------
# The Nest CLI, TypeScript and cross-env (used only by the local
# provider-switching scripts) are build-time tools; keeping them in a separate
# stage means none of them ships in the runtime image.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Manifests before sources, so editing code does not invalidate the dependency
# layer. apps/web/package.json is here only because npm checks every workspace
# recorded in the lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=apps/api
COPY apps/api/ apps/api/
RUN npm run build --workspace=apps/api

# --- Stage 2: runtime ---------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Runtime dependencies only, from the same lockfile. --omit=optional drops
# typescript, which the lockfile marks devOptional and --omit=dev alone keeps.
# No runtime dependency declares an install script, so --ignore-scripts
# changes nothing functionally and runs no third-party code during the build.
RUN npm ci --omit=dev --omit=optional --workspace=apps/api --ignore-scripts \
  && npm cache clean --force
# Compiled JavaScript only. The Python MCP classifier is not copied: it runs as
# its own service and the API reaches it over HTTP via LOCAL_AI_ENDPOINT.
COPY --from=build /app/apps/api/dist apps/api/dist

# The process holds the Gemini API key and the Supabase keys. The
# unprivileged `node` user, with the code left owned by root, keeps a
# compromised process from rewriting the app or anything else in the image.
USER node
WORKDIR /app/apps/api
# Informational: the app binds $PORT (3000 by default) on 0.0.0.0.
EXPOSE 3000
# Exec form: node runs as PID 1 and gets SIGTERM itself, which triggers the Nest
# shutdown hooks. Going through npm (as railway.json's startCommand does) adds
# a parent process between the platform and the app.
CMD ["node", "dist/main.js"]
