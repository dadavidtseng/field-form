# Sync server image. Build from the repository root (the server needs the shared workspace):
#   docker build -f server/Dockerfile -t field-form-server .
#   docker run -p 8787:8787 -v field-form-data:/data field-form-server
#
# Node 24 has node:sqlite built in, so there is no native build step.
FROM node:24-slim

WORKDIR /repo

# Manifests first, so dependency layers are cached until they change. The app manifest is copied
# only because the workspace lockfile lists it; its dependencies are not installed.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY app/package.json app/
RUN npm ci --workspace @field-form/server --workspace @field-form/shared --include-workspace-root=false \
    && npm cache clean --force

COPY shared shared
COPY server server

# The SQLite op log lives on a volume so it survives container restarts.
ENV PORT=8787 DB_PATH=/data/field-form.db IN_CONTAINER=1
VOLUME /data
EXPOSE 8787

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:8787/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

WORKDIR /repo/server
CMD ["node", "--import", "tsx", "src/index.ts"]
