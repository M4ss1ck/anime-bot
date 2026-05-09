#!/usr/bin/env node
// Applies un-applied Prisma migrations to the Turso DB pointed at by
// TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
//
// Workflow (per https://www.prisma.io/docs/orm/overview/databases/turso):
//   1. Locally, with DATABASE_URL=file:./prisma/dev.db (or a scratch file),
//      run: `pnpm prisma migrate dev --name <change-name>`
//      This generates prisma/migrations/<timestamp>_<name>/migration.sql.
//   2. Run this script. It reads every migration directory in order and
//      applies any that haven't been recorded in the `_applied_migrations`
//      tracking table on the Turso DB.
//
// Equivalent to the docs' `turso db shell <db> < migration.sql` step,
// just programmatic so the Turso CLI isn't required.

import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL?.trim()
const authToken = process.env.TURSO_AUTH_TOKEN?.trim()

if (!url) {
    console.error('TURSO_DATABASE_URL is required (set it in .env)')
    process.exit(1)
}

const migrationsDir = 'prisma/migrations'

let dirs
try {
    dirs = (await readdir(migrationsDir, { withFileTypes: true }))
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort()
} catch {
    console.error(`No "${migrationsDir}" directory found.`)
    console.error('First, generate an initial migration locally:')
    console.error('  DATABASE_URL=file:./prisma/dev.db pnpm exec prisma migrate dev --name init')
    process.exit(1)
}

if (dirs.length === 0) {
    console.error(`"${migrationsDir}" is empty. Run \`pnpm exec prisma migrate dev --name init\` first.`)
    process.exit(1)
}

console.log(`Connecting to ${url.replace(/\?.*$/, '')}...`)
const client = createClient({ url, authToken })

await client.execute(`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
        name TEXT PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`)

const appliedRows = await client.execute('SELECT name FROM _applied_migrations')
const applied = new Set(appliedRows.rows.map(r => r.name))

let count = 0
for (const name of dirs) {
    if (applied.has(name)) {
        console.log(`  skip (already applied): ${name}`)
        continue
    }

    const sqlPath = join(migrationsDir, name, 'migration.sql')
    let sql
    try {
        sql = await readFile(sqlPath, 'utf-8')
    } catch {
        console.warn(`  skip (no migration.sql): ${name}`)
        continue
    }

    const statements = sql
        .replace(/--.*$/gm, '')              // strip line comments
        .replace(/^\s*Loaded .*$/gm, '')     // strip prisma CLI preamble if any
        .split(/;\s*$/m)
        .map(s => s.trim())
        .filter(Boolean)

    console.log(`Applying ${name} (${statements.length} statements)...`)
    for (const stmt of statements) {
        await client.execute(stmt)
    }

    await client.execute({
        sql: 'INSERT INTO _applied_migrations (name) VALUES (?)',
        args: [name],
    })

    count++
    console.log(`  ✓ ${name}`)
}

console.log(`\nDone. ${count} migration(s) applied.`)
client.close()
