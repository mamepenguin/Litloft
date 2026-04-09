FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ .
COPY addon[s]/ /tmp/_all_addons/
RUN find src/addons -maxdepth 1 -type l -delete 2>/dev/null; \
    for addon_dir in /tmp/_all_addons/*/; do \
      [ -d "$addon_dir/frontend" ] || continue; \
      name="$(basename "$addon_dir")"; \
      mkdir -p "src/addons/$name"; \
      cp -r "$addon_dir/frontend/"* "src/addons/$name/"; \
    done && rm -rf /tmp/_all_addons
# Auto-generate page wrappers for addons that have a Page.tsx
RUN for addon_dir in src/addons/*/; do \
      name="$(basename "$addon_dir")"; \
      [ -f "$addon_dir/Page.tsx" ] || continue; \
      mkdir -p "src/app/addons/$name"; \
      printf '"use client";\nimport Page from "@/addons/%s/Page";\nexport default Page;\n' "$name" \
        > "src/app/addons/$name/page.tsx"; \
    done
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
