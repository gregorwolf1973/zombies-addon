#!/bin/sh
set -e
export ZOMBIES_OPTIONS=/data/options.json
export ZOMBIES_DB=/data/zombies.db
export PORT=2567
export NODE_ENV=production
cd /app
exec node --disable-warning=ExperimentalWarning server/index.mjs
