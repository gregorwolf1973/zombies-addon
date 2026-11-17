ARG BUILD_FROM
FROM $BUILD_FROM

# Node.js 22 aus Alpine 3.22
RUN apk add --no-cache nodejs npm

WORKDIR /app
COPY package.json package-lock.json ./
# Phaser bringt Quellen und Typen mit, gebraucht wird nur dist/phaser.min.js
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && find node_modules/phaser -mindepth 1 -maxdepth 1 ! -name dist ! -name package.json -exec rm -rf {} + \
    && find node_modules/phaser/dist -type f ! -name phaser.min.js -delete \
    && apk del npm

COPY server/ server/
COPY client/ client/
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
