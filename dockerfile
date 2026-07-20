FROM node:20-bullseye-slim

ARG N8N_VERSION=1.117.3
ENV N8N_VERSION=${N8N_VERSION}
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV npm_config_audit=false npm_config_fund=false

WORKDIR /app

# 1) OS Dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates wget gnupg bash \
       libnss3 libatk1.0-0 libgtk-3-0 libxss1 libasound2 \
       libgbm1 libx11-xcb1 libxcomposite1 libxdamage1 \
       libxrandr2 libcups2 libpangocairo-1.0-0 libpango-1.0-0 \
       libatk-bridge2.0-0 fonts-liberation fontconfig locales \
    && rm -rf /var/lib/apt/lists/*

# 2) Global CLIs
USER root
RUN npm i -g --unsafe-perm \
    n8n@${N8N_VERSION} \
    pa11y \
    puppeteer-core@22 \
    @axe-core/cli \
    playwright \
    axe-core \
    pdf-lib

ENV NODE_PATH=/usr/local/lib/node_modules

# 3) App Dependencies
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    sh -c "if [ -f package.json ]; then npm ci --omit=dev; else echo 'skipping npm install'; fi"

# 4) Playwright Browsers
RUN npx playwright install --with-deps chromium

# 5) Runner Scripts
COPY runner/*.js /usr/local/bin/
RUN chmod +x /usr/local/bin/*.js

# 6) Rest kopieren
COPY . .

# 7) Ownership
RUN chown -R node:node /app \
 && mkdir -p /home/node/.cache/ms-playwright \
 && chown -R node:node /home/node/.cache

USER node
EXPOSE 5678
CMD ["n8n"]
