CREATE TABLE "TaskRun" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "lastRunAt" DATETIME NOT NULL,
    "lastDurationMs" INTEGER NOT NULL,
    "lastStatus" TEXT NOT NULL,
    "lastDetail" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "CommandUsage" (
    "command" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME NOT NULL
);

-- SQLite rejects CURRENT_TIMESTAMP as an ADD COLUMN default but accepts a constant, so
-- no table rebuild is needed. The literal doubles as the backfill stamp for existing
-- rows — growth metrics are only truthful from this date on, which /metrics states
-- explicitly via its "Growth tracked since" line. Prisma applies @default(now()) itself
-- on insert, so this DB-level default is only a fallback.
ALTER TABLE "User" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '2026-08-06 00:00:00';
ALTER TABLE "Anime" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '2026-08-06 00:00:00';
ALTER TABLE "Novel" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '2026-08-06 00:00:00';
