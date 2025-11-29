import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { PrismaClient } from "../generated/prisma/client.js"

const databaseUrl = (process.env.DATABASE_URL || 'file:./dev.db').trim()

const adapter = new PrismaBetterSqlite3({
    url: databaseUrl,
})
export const prisma = new PrismaClient({
    adapter,
})
