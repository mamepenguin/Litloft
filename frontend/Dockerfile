FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ .
COPY addon[s]/ /tmp/_all_addons/
# `COPY frontend/ .` brings the host's gitignored `src/addons/` along with
# everything else, and whatever it holds points at absolute paths on the host
# that do not exist here. Discard it outright rather than pruning by shape:
# `setup-addons.sh` builds a directory of per-file symlinks, an older checkout
# has a directory symlink, and a stale entry of either shape is a dangling
# link the build would carry into the image. The copy below is the only thing
# that should decide what `src/addons` contains.
RUN rm -rf src/addons; \
    for addon_dir in /tmp/_all_addons/*/; do \
      [ -d "$addon_dir/frontend" ] || continue; \
      name="$(basename "$addon_dir")"; \
      mkdir -p "src/addons/$name"; \
      cp -r "$addon_dir/frontend/"* "src/addons/$name/"; \
    done && rm -rf /tmp/_all_addons
# Page wrappers are handled by the generic dispatcher at
# src/app/addons/[name]/page.tsx and src/app/drive/[name]/addons/[addon]/page.tsx.
# Merge addon translation files into core messages
RUN node scripts/merge-addon-messages.mjs
RUN pnpm build

FROM node:20-alpine AS deps
WORKDIR /deps
RUN npm init -y && npm install http-proxy@^1.18.1

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mv server.js server-next.js
COPY --from=builder /app/server.js ./server.js
COPY --from=deps /deps/node_modules/http-proxy ./node_modules/http-proxy
COPY --from=deps /deps/node_modules/eventemitter3 ./node_modules/eventemitter3
COPY --from=deps /deps/node_modules/requires-port ./node_modules/requires-port
COPY --from=deps /deps/node_modules/follow-redirects ./node_modules/follow-redirects
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
