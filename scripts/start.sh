#!/bin/sh
set -e

echo "=== Bot Startup ==="

# Trim whitespace from TURSO_DATABASE_URL
TURSO_DATABASE_URL=$(echo "$TURSO_DATABASE_URL" | tr -d '[:space:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
export TURSO_DATABASE_URL

if [ -z "$TURSO_DATABASE_URL" ]; then
    echo "ERROR: TURSO_DATABASE_URL is not set" >&2
    exit 1
fi

# Mask token / URL host for the log line
echo "TURSO_DATABASE_URL: ${TURSO_DATABASE_URL%%\?*}"

# Schema migrations are NOT run here — the Prisma CLI cannot push to Turso URLs.
# Run scripts/sync-turso-schema.ts manually after schema changes (see PRISMA.md).

echo "=== Starting application ==="
exec node -r dotenv/config ./dist/main.js
