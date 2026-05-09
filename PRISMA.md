# Database

The bot uses Prisma 7 with the libSQL driver adapter
(`@prisma/adapter-libsql`). The same adapter handles both local SQLite files
(`file:./dev.db`) and remote Turso databases (`libsql://<db>.turso.io`) — only
the URL changes.

Setup follows the
[Prisma + Turso guide](https://www.prisma.io/docs/orm/overview/databases/turso),
adapted for Prisma 7. Two notable v7 differences from the v6-era docs:

- The adapter class is exported as `PrismaLibSql` (was `PrismaLibSQL` in v6).
- `prisma migrate diff --to-schema-datamodel` was renamed to `--to-schema`.

## Local development

```sh
# .env
DATABASE_URL=file:./prisma/dev.db
TURSO_DATABASE_URL=file:./prisma/dev.db
TURSO_AUTH_TOKEN=
```

The Prisma CLI (`prisma migrate dev`, `prisma studio`, `prisma db push`) talks
to a **local SQLite file** via `DATABASE_URL`. The runtime client uses
`TURSO_DATABASE_URL` through the libSQL adapter — pointing it at the same
local file works fine for development.

## Production / Turso

```sh
# .env
TURSO_DATABASE_URL=libsql://<your-db>.turso.io
TURSO_AUTH_TOKEN=<token from `turso db tokens create <db>`>
```

The Prisma CLI **cannot** target a Turso URL (its schema engine is
SQLite-file-only). The canonical workflow is:

1. **Generate migrations against a local SQLite file** (`DATABASE_URL=file:./prisma/dev.db`):

   ```sh
   pnpm exec prisma migrate dev --name <change-name>
   ```

   This creates `prisma/migrations/<timestamp>_<name>/migration.sql`.

2. **Apply migrations to Turso**:

   ```sh
   pnpm turso:sync-schema
   ```

   This reads every migration directory in order and applies any not yet
   recorded in the `_applied_migrations` tracking table on the Turso DB.
   Equivalent to the docs'
   `turso db shell <db> < ./prisma/migrations/<folder>/migration.sql`,
   just programmatic so the Turso CLI isn't required.

## Migrating from local SQLite to Turso (preserving data)

1. From the running bot, in Telegram (admin): `/dbexport` → save the JSON.
2. `turso db create animebot` → grab the URL + create a token.
3. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env` (production).
4. If you don't have a migration yet:
   `DATABASE_URL=file:./prisma/dev.db pnpm exec prisma migrate dev --name init`
5. `pnpm turso:sync-schema` to apply the schema to Turso.
6. Restart the bot, then in Telegram reply to the JSON file with `/dbimport`.
