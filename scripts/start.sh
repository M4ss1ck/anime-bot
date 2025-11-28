#!/bin/sh
set -e

echo "=== Database Startup Script ==="
echo "DATABASE_URL: $DATABASE_URL"

# Show current schema status
echo "=== Checking migration status ==="
pnpm exec prisma migrate status || true

# Push schema changes WITHOUT regenerating the client
echo "=== Pushing schema to database ==="
pnpm exec prisma db push --skip-generate --accept-data-loss

# Verify the Anime table has anilistId column
echo "=== Verifying schema ==="
pnpm exec prisma db execute --stdin <<EOF || true
SELECT sql FROM sqlite_master WHERE type='table' AND name='Anime';
EOF

echo "=== Starting application ==="
exec node -r dotenv/config ./dist/main.js
