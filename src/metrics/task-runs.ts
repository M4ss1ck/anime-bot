import { prisma } from '../db/prisma.js'
import { logger } from '../logger/index.js'

export type TaskName =
    | 'daily_summary'
    | 'new_season_check'
    | 'novel_releases_check'
    | 'new_volumes_check'

// Detail is shown in a Telegram message, so a runaway stack trace would blow the layout.
const MAX_DETAIL_LENGTH = 200

/**
 * Runs a scheduled task and persists when it ran, how long it took and how it went.
 * Resolves in every case: a metrics failure must never take down the task it measures.
 */
export const recordRun = async (name: TaskName, fn: () => Promise<unknown>): Promise<void> => {
    const startedAt = Date.now()
    let failed = false
    let detail: string | null = null

    try {
        const result = await fn()
        if (typeof result === 'string') detail = result
    } catch (error) {
        failed = true
        detail = String(error)
        logger.error(`Task ${name} failed: ${error}`)
    }

    const lastRunAt = new Date()
    const lastDurationMs = Date.now() - startedAt
    const lastStatus = failed ? 'failed' : 'ok'
    const lastDetail = detail?.slice(0, MAX_DETAIL_LENGTH) ?? null

    await prisma.taskRun.upsert({
        where: { name },
        create: {
            name,
            lastRunAt,
            lastDurationMs,
            lastStatus,
            lastDetail,
            runCount: 1,
            failCount: failed ? 1 : 0
        },
        update: {
            lastRunAt,
            lastDurationMs,
            lastStatus,
            lastDetail,
            runCount: { increment: 1 },
            ...(failed ? { failCount: { increment: 1 } } : {})
        }
    }).catch(error => logger.error(`Failed to record task run for ${name}: ${error}`))
}
