#!/bin/sh
set -e
export ZOMBIES_OPTIONS=/data/options.json
export PORT=2567
export NODE_ENV=production
cd /app
exec node server/index.mjs
