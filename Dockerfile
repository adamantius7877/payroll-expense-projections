FROM node:24-slim AS deps

WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
  && corepack prepare pnpm@11.9.0 --activate \
  && pnpm install --frozen-lockfile --ignore-scripts

FROM node:24-slim AS builder

WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV WRANGLER_LOG_PATH=.wrangler/wrangler.log

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable \
  && corepack prepare pnpm@11.9.0 --activate \
  && pnpm build

FROM node:24-slim AS runner

WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
ENV WRANGLER_LOG_PATH=.wrangler/wrangler.log

COPY --from=builder /app ./
RUN corepack enable \
  && corepack prepare pnpm@11.9.0 --activate

EXPOSE 3001

CMD ["sh", "-c", "pnpm start -- --hostname 0.0.0.0 --port ${PORT}"]
