import { prisma } from '../db/prisma.js'
import { logger } from '../logger/index.js'

type Usage = {
    count: number
    lastUsedAt: Date
}

// The bot is a single process, so a module-level map is all the shared state we need.
// Counting in memory keeps the per-update hot path free of Turso round trips.
const buffer = new Map<string, Usage>()

const add = (command: string, count: number, lastUsedAt: Date) => {
    const current = buffer.get(command)
    buffer.set(command, {
        count: (current?.count ?? 0) + count,
        lastUsedAt: current && current.lastUsedAt > lastUsedAt ? current.lastUsedAt : lastUsedAt
    })
}

export const trackCommand = (command: string): void => {
    add(command, 1, new Date())
}

export const pendingCommandCount = (): number => {
    let total = 0
    for (const usage of buffer.values()) total += usage.count
    return total
}

/**
 * Writes buffered counts to the database. The buffer is cleared before awaiting so
 * increments arriving mid-flush are not double counted; entries whose write fails are
 * merged back so they are not silently lost. Resolves in every case.
 */
export const flushCommandUsage = async (): Promise<void> => {
    if (buffer.size < 1) return

    const entries = [...buffer.entries()]
    buffer.clear()

    for (const [command, usage] of entries) {
        try {
            await prisma.commandUsage.upsert({
                where: { command },
                create: { command, count: usage.count, lastUsedAt: usage.lastUsedAt },
                update: { count: { increment: usage.count }, lastUsedAt: usage.lastUsedAt }
            })
        } catch (error) {
            logger.error(`Failed to flush usage for /${command}: ${error}`)
            add(command, usage.count, usage.lastUsedAt)
        }
    }
}
