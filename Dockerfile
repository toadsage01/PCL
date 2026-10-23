# PCL — company-internal portal image.
# Zero build step: the site is plain static files + one Node server that
# replaces the Vercel /api/submit function with the same contract.
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Whitelist copy — the image carries only what the portals need
# (no .git, no docs, no scratchpads, no terraform).
COPY server.js ./
COPY index.html leaderboard.html admin.html director.html ./
COPY css/ css/
COPY js/ js/
COPY fonts/ fonts/
COPY assets/ assets/

EXPOSE 3000
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
