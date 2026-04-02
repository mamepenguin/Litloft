FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN npx tsc server.ts --esModuleInterop --module commonjs --moduleResolution node --skipLibCheck --outDir .

FROM node:20-alpine AS deps
WORKDIR /deps
RUN npm init -y && npm install http-proxy@^1.18.1

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js
COPY --from=deps /deps/node_modules ./node_modules
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
