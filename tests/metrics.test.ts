import { afterEach, describe, expect, test } from 'bun:test'
import type { Api } from 'grammy'
import { prisma } from '../src/db/prisma.ts'
import { recordRun } from '../src/metrics/task-runs.ts'
import { flushCommandUsage, pendingCommandCount, trackCommand } from '../src/metrics/command-usage.ts'
import { checkNewNovelReleases, checkNewSeasons } from '../src/middleware/notifications.ts'
import { handleCheck } from '../src/middleware/check.ts'

const originalTaskRunUpsert = prisma.taskRun.upsert

type UpsertArgs = {
    where: { name: string }
    create: Record<string, unknown>
    update: Record<string, unknown>
}

function mockTaskRunUpsert(fail = false) {
    const calls: UpsertArgs[] = []

    prisma.taskRun.upsert = ((args: UpsertArgs) => {
        calls.push(args)
        return fail ? Promise.reject(new Error('db down')) : Promise.resolve({})
    }) as unknown as typeof prisma.taskRun.upsert

    return calls
}

afterEach(() => {
    prisma.taskRun.upsert = originalTaskRunUpsert
})

describe('recordRun', () => {
    test('records a successful run with its duration and returned detail', async () => {
        const calls = mockTaskRunUpsert()

        await recordRun('new_volumes_check', async () => '3 volume(s) notified')

        expect(calls).toHaveLength(1)
        expect(calls[0]?.where).toEqual({ name: 'new_volumes_check' })
        expect(calls[0]?.create.lastStatus).toBe('ok')
        expect(calls[0]?.create.lastDetail).toBe('3 volume(s) notified')
        expect(calls[0]?.create.runCount).toBe(1)
        expect(calls[0]?.create.failCount).toBe(0)
        expect(typeof calls[0]?.create.lastDurationMs).toBe('number')
        expect(calls[0]?.update.runCount).toEqual({ increment: 1 })
    })

    test('records a failed run with the error message as detail', async () => {
        const calls = mockTaskRunUpsert()

        await recordRun('new_season_check', async () => {
            throw new Error('anilist unreachable')
        })

        expect(calls[0]?.create.lastStatus).toBe('failed')
        expect(String(calls[0]?.create.lastDetail)).toContain('anilist unreachable')
        expect(calls[0]?.create.failCount).toBe(1)
        expect(calls[0]?.update.failCount).toEqual({ increment: 1 })
    })

    test('leaves detail empty when the task returns nothing', async () => {
        const calls = mockTaskRunUpsert()

        await recordRun('daily_summary', async () => undefined)

        expect(calls[0]?.create.lastStatus).toBe('ok')
        expect(calls[0]?.create.lastDetail).toBeNull()
    })

    test('never rejects, even when its own write fails', async () => {
        mockTaskRunUpsert(true)

        expect(await recordRun('daily_summary', async () => undefined)).toBeUndefined()
    })

    test('never rejects when the task throws', async () => {
        mockTaskRunUpsert(true)

        expect(await recordRun('daily_summary', async () => {
            throw new Error('boom')
        })).toBeUndefined()
    })
})

const originalCommandUsageUpsert = prisma.commandUsage.upsert

type UsageUpsertArgs = {
    where: { command: string }
    create: { command: string, count: number, lastUsedAt: Date }
    update: { count: { increment: number }, lastUsedAt: Date }
}

function mockCommandUsageUpsert(failOn?: string) {
    const calls: UsageUpsertArgs[] = []

    prisma.commandUsage.upsert = ((args: UsageUpsertArgs) => {
        calls.push(args)
        return args.where.command === failOn
            ? Promise.reject(new Error('db down'))
            : Promise.resolve({})
    }) as unknown as typeof prisma.commandUsage.upsert

    return calls
}

describe('command usage', () => {
    afterEach(async () => {
        // Drain the module-level map so tests do not leak counts into each other.
        mockCommandUsageUpsert()
        await flushCommandUsage()
        prisma.commandUsage.upsert = originalCommandUsageUpsert
    })

    test('accumulates counts in memory without touching the database', () => {
        prisma.commandUsage.upsert = (() => {
            throw new Error('must not be called')
        }) as unknown as typeof prisma.commandUsage.upsert

        trackCommand('check')
        trackCommand('check')
        trackCommand('myanime')

        expect(pendingCommandCount()).toBe(3)
    })

    test('flush drains the buffer into upserts', async () => {
        trackCommand('check')
        trackCommand('check')
        const calls = mockCommandUsageUpsert()

        await flushCommandUsage()

        expect(calls).toHaveLength(1)
        expect(calls[0]?.where).toEqual({ command: 'check' })
        expect(calls[0]?.create.count).toBe(2)
        expect(calls[0]?.update.count).toEqual({ increment: 2 })
        expect(pendingCommandCount()).toBe(0)
    })

    test('flush is a no-op when nothing is buffered', async () => {
        const calls = mockCommandUsageUpsert()

        await flushCommandUsage()

        expect(calls).toHaveLength(0)
    })

    test('merges counts back into the buffer when an upsert fails', async () => {
        trackCommand('check')
        trackCommand('check')
        trackCommand('myanime')
        mockCommandUsageUpsert('check')

        await flushCommandUsage()

        // "check" (2) is preserved for the next flush; "myanime" (1) was written.
        expect(pendingCommandCount()).toBe(2)
    })

    test('never rejects when the database is unreachable', async () => {
        trackCommand('check')
        mockCommandUsageUpsert('check')

        expect(await flushCommandUsage()).toBeUndefined()
    })
})

const originalAnimeFindMany = prisma.anime.findMany
const originalNovelFindMany = prisma.novel.findMany

describe('task failures reach the caller', () => {
    afterEach(() => {
        prisma.anime.findMany = originalAnimeFindMany
        prisma.novel.findMany = originalNovelFindMany
    })

    test('checkNewSeasons rejects when the database fails', async () => {
        prisma.anime.findMany = (() =>
            Promise.reject(new Error('db down'))) as typeof prisma.anime.findMany

        // The await is load-bearing: without it the assertion never runs and the test
        // passes no matter what the function does.
        await expect(checkNewSeasons({} as Api)).rejects.toThrow('db down')
    })

    test('checkNewNovelReleases rejects when the database fails', async () => {
        prisma.novel.findMany = (() =>
            Promise.reject(new Error('db down'))) as typeof prisma.novel.findMany

        await expect(checkNewNovelReleases({} as Api)).rejects.toThrow('db down')
    })
})

function makeCtx(userId: number) {
    const replies: string[] = []
    return {
        ctx: {
            from: { id: userId },
            api: {},
            reply: (text: string) => {
                replies.push(text)
                return Promise.resolve()
            }
        } as unknown as Parameters<typeof handleCheck>[0],
        replies
    }
}

describe('/check summary caveat', () => {
    afterEach(() => {
        prisma.anime.findMany = originalAnimeFindMany
        prisma.novel.findMany = originalNovelFindMany
    })

    test('warns about incomplete checks when the season check fails', async () => {
        prisma.anime.findMany = (() =>
            Promise.reject(new Error('db down'))) as typeof prisma.anime.findMany
        prisma.novel.findMany = (() => Promise.resolve([])) as unknown as typeof prisma.novel.findMany

        const { ctx, replies } = makeCtx(1001)
        await handleCheck(ctx)

        expect(replies.some(text => text.includes('Some checks could not be completed'))).toBe(true)
    })

    test('uses the normal wording when all checks succeed', async () => {
        prisma.anime.findMany = (() => Promise.resolve([])) as unknown as typeof prisma.anime.findMany
        prisma.novel.findMany = (() => Promise.resolve([])) as unknown as typeof prisma.novel.findMany

        const { ctx, replies } = makeCtx(1002)
        await handleCheck(ctx)

        expect(replies.some(text => text.includes('Any other update was sent'))).toBe(true)
    })
})
