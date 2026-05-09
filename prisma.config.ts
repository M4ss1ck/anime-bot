import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
    schema: 'prisma/schema.prisma',
    // Used only by the Prisma CLI (db push, studio, migrate diff) against a local SQLite file.
    // The runtime client uses the libSQL adapter via TURSO_DATABASE_URL — see src/db/prisma.ts.
    datasource: {
        url: env('DATABASE_URL')?.trim(),
    },
})
