import { afterEach, describe, expect, test } from 'bun:test'
import type { Api } from 'grammy'
import { prisma } from '../src/db/prisma.ts'
import { recordRun } from '../src/metrics/task-runs.ts'
import { flushCommandUsage, pendingCommandCount, trackCommand } from '../src/metrics/command-usage.ts'
import { checkNewNovelReleases, checkNewSeasons } from '../src/middleware/notifications.ts'
import { handleCheck } from '../src/middleware/check.ts'
import { collectMetrics } from '../src/metrics/collect.ts'
import { formatMetrics } from '../src/middleware/metrics.ts'
import type { Metrics } from '../src/metrics/collect.ts'

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

const originalTransaction = prisma.$transaction

describe('collectMetrics', () => {
    afterEach(() => {
        prisma.$transaction = originalTransaction
    })

    test('assembles totals, growth and derived numbers', async () => {
        const day = 24 * 60 * 60 * 1000
        const trackingSince = new Date('2026-01-01T00:00:00Z')

        prisma.$transaction = (() => Promise.resolve([
            10,                                     // users total
            2,                                      // users new 7d
            5,                                      // users new 30d
            { createdAt: trackingSince },           // earliest user
            3,                                      // dormant users
            40,                                     // anime total
            4,                                      // anime new 7d
            7,                                      // anime on air
            20,                                     // novels total
            1,                                      // novels new 7d
            6,                                      // novels releasing
            5,                                      // novels hardcover-linked
            2,                                      // notification groups
            [{ _count: { users: 3 } }, { _count: { users: 1 } }], // memberships
            { createdAt: new Date('2026-07-30T00:00:00Z') },      // newest group
            [                                       // reminder jobs
                { date: String(Date.now() + day) },
                { date: String(Date.now() - day) },
                { date: '0 9 * * *' }
            ],
            9,                                      // notification history total
            1,                                      // notification history 7d
            { createdAt: new Date('2026-08-04T00:00:00Z') },
            8,                                      // volume notifications total
            2,                                      // volume notifications 7d
            { createdAt: new Date('2026-08-05T00:00:00Z') },
            [],                                     // task runs
            [{ command: 'check', count: 12 }, { command: 'ping', count: 3 }],
            [{ userId: 'a' }, { userId: 'b' }],     // anime active 7d
            [{ userId: 'b' }, { userId: 'c' }],     // novel active 7d
            [{ userId: 'a' }],                      // anime active 30d
            [{ userId: 'd' }]                       // novel active 30d
        ])) as unknown as typeof prisma.$transaction

        const metrics = await collectMetrics()

        expect(metrics.users.total).toBe(10)
        expect(metrics.users.new7d).toBe(2)
        expect(metrics.users.dormant).toBe(3)
        expect(metrics.users.trackingSince).toEqual(trackingSince)
        expect(metrics.users.active7d).toBe(3)   // a, b, c
        expect(metrics.users.active30d).toBe(2)  // a, d
        expect(metrics.anime.avgPerUser).toBe(4)
        expect(metrics.novels.hardcoverLinked).toBe(5)
        expect(metrics.groups.memberships).toBe(4)
        expect(metrics.reminders.active).toBe(2) // future timestamp + cron expression
        expect(metrics.reminders.expired).toBe(1)
        expect(metrics.commands.total).toBe(15)
        expect(metrics.commands.top[0]).toEqual({ command: 'check', count: 12 })
    })

    test('handles an empty database without dividing by zero', async () => {
        prisma.$transaction = (() => Promise.resolve([
            0, 0, 0, null, 0,
            0, 0, 0,
            0, 0, 0, 0,
            0, [], null,
            [],
            0, 0, null,
            0, 0, null,
            [], [],
            [], [], [], []
        ])) as unknown as typeof prisma.$transaction

        const metrics = await collectMetrics()

        expect(metrics.users.total).toBe(0)
        expect(metrics.anime.avgPerUser).toBe(0)
        expect(metrics.novels.avgPerUser).toBe(0)
        expect(metrics.users.trackingSince).toBeNull()
        expect(metrics.tasks).toHaveLength(4)
        expect(metrics.tasks[0]?.lastRunAt).toBeNull()
        expect(metrics.commands.top).toHaveLength(0)
    })
})

const emptyMetrics = (): Metrics => ({
    generatedAt: new Date('2026-08-06T12:00:00Z'),
    uptimeMs: 0,
    mode: 'polling',
    env: 'development',
    users: { total: 0, new7d: 0, new30d: 0, active7d: 0, active30d: 0, dormant: 0, trackingSince: null },
    anime: { total: 0, new7d: 0, onAir: 0, avgPerUser: 0 },
    novels: { total: 0, new7d: 0, releasing: 0, hardcoverLinked: 0, avgPerUser: 0 },
    groups: { total: 0, memberships: 0, newest: null },
    reminders: { active: 0, expired: 0 },
    delivered: {
        seasons: { total: 0, last7d: 0, latest: null },
        volumes: { total: 0, last7d: 0, latest: null }
    },
    tasks: [
        { name: 'daily_summary', lastRunAt: null, lastDurationMs: null, lastStatus: null, lastDetail: null, runCount: 0, failCount: 0, nextRunAt: null },
        { name: 'new_season_check', lastRunAt: null, lastDurationMs: null, lastStatus: null, lastDetail: null, runCount: 0, failCount: 0, nextRunAt: null },
        { name: 'novel_releases_check', lastRunAt: null, lastDurationMs: null, lastStatus: null, lastDetail: null, runCount: 0, failCount: 0, nextRunAt: null },
        { name: 'new_volumes_check', lastRunAt: null, lastDurationMs: null, lastStatus: null, lastDetail: null, runCount: 0, failCount: 0, nextRunAt: null }
    ],
    commands: { total: 0, pendingFlush: 0, top: [] }
})

describe('formatMetrics', () => {
    test('renders every section with populated data', () => {
        const metrics = emptyMetrics()
        metrics.uptimeMs = 3 * 24 * 60 * 60 * 1000
        metrics.mode = 'webhook'
        metrics.env = 'production'
        metrics.users = { total: 128, new7d: 4, new30d: 19, active7d: 31, active30d: 58, dormant: 12, trackingSince: new Date('2026-08-06T00:00:00Z') }
        metrics.anime = { total: 1204, new7d: 31, onAir: 87, avgPerUser: 9.4 }
        metrics.novels = { total: 342, new7d: 8, releasing: 61, hardcoverLinked: 44, avgPerUser: 2.7 }
        metrics.groups = { total: 7, memberships: 23, newest: new Date('2026-07-30T00:00:00Z') }
        metrics.reminders = { active: 54, expired: 12 }
        metrics.tasks[3] = {
            name: 'new_volumes_check',
            lastRunAt: new Date('2026-08-06T08:00:00Z'),
            lastDurationMs: 12300,
            lastStatus: 'ok',
            lastDetail: '3 volume(s) notified',
            runCount: 142,
            failCount: 0,
            nextRunAt: new Date('2026-08-07T08:00:00Z')
        }
        metrics.commands = { total: 3142, pendingFlush: 14, top: [{ command: 'check', count: 412 }] }

        const text = formatMetrics(metrics)

        expect(text).toContain('Bot Metrics')
        expect(text).toContain('128 total')
        expect(text).toContain('on air: 87')
        expect(text).toContain('Hardcover-linked: 44')
        expect(text).toContain('54 active')
        expect(text).toContain('new_volumes_check')
        expect(text).toContain('3 volume(s) notified')
        expect(text).toContain('/check 412')
        expect(text).toContain('14 pending flush')
        expect(text.length).toBeLessThan(4096)
    })

    test('renders the empty state without crashing on nulls', () => {
        const text = formatMetrics(emptyMetrics())

        expect(text).toContain('never run')
        expect(text).toContain('no commands recorded yet')
        expect(text).not.toContain('undefined')
        expect(text).not.toContain('NaN')
        expect(text).not.toContain('Invalid Date')
    })

    test('escapes HTML in task detail so a failure message cannot break the message', () => {
        const metrics = emptyMetrics()
        metrics.tasks[0] = {
            name: 'daily_summary',
            lastRunAt: new Date('2026-08-06T09:00:00Z'),
            lastDurationMs: 10,
            lastStatus: 'failed',
            lastDetail: 'Error: <bad> & "worse"',
            runCount: 1,
            failCount: 1
        }

        const text = formatMetrics(metrics)

        expect(text).toContain('&lt;bad&gt;')
        expect(text).not.toContain('<bad>')
    })
})
