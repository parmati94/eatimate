FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Pages are prerendered, so anything the layout reads from the environment is
# baked in HERE, not at container start. The Cloudflare beacon token is public
# (it ships in every page's HTML); without it the beacon is simply omitted.
ARG CF_BEACON_TOKEN=""
ENV CF_BEACON_TOKEN=$CF_BEACON_TOKEN
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Chain data ships in the image; the compose bind mount overlays it so new
# The chain data ships in the image; there is no runtime mount.
COPY --from=builder /app/data ./data
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
