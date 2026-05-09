import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../generated/prisma/client.js"

const url = (process.env.TURSO_DATABASE_URL || 'file:./dev.db').trim()
const authToken = process.env.TURSO_AUTH_TOKEN?.trim()

const adapter = new PrismaLibSql({ url, authToken })

export const prisma = new PrismaClient({ adapter })
