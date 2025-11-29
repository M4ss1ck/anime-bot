#!/bin/sh
set -e

echo "=== Database Startup Script ==="

# Trim any whitespace from DATABASE_URL
DATABASE_URL=$(echo "$DATABASE_URL" | tr -d '[:space:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
export DATABASE_URL

echo "DATABASE_URL: '$DATABASE_URL'"

# Show current schema status
echo "=== Checking migration status ==="
pnpm exec prisma migrate status || true

# Push schema changes to database
echo "=== Pushing schema to database ==="
pnpm exec prisma db push --accept-data-loss

# Verify the Anime table has anilistId column
echo "=== Verifying schema ==="
pnpm exec prisma db execute --stdin <<EOF || true
SELECT sql FROM sqlite_master WHERE type='table' AND name='Anime';
EOF

echo "=== Starting application ==="
exec node -r dotenv/config ./dist/main.js
