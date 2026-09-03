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
# Same deal for the Umami website id, which is public for the same reason: it
# ships in the HTML of every page that carries the tracker. Unset, the app
# renders no tracker at all, which is what a local build should do.
ARG UMAMI_WEBSITE_ID=""
ENV UMAMI_WEBSITE_ID=$UMAMI_WEBSITE_ID
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The chain data ships in the image; there is no runtime mount, so a data
# change is a rebuild and a redeploy.
COPY --from=builder /app/data ./data
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
