import { prisma } from '../db/prisma.js'
import { getScheduled } from '../scheduler/index.js'
import { pendingCommandCount } from './command-usage.js'
import type { TaskName } from './task-runs.js'

// Which node-schedule job actually drives each tracked task. The last three all run
// inside the single new_season_check cron, but are recorded separately so "when were
// novels last checked" is answerable on its own.
const TASK_JOB_IDS: Record<TaskName, string> = {
    daily_summary: 'internal:daily_summary',
    new_season_check: 'internal:new_season_check',
    novel_releases_check: 'internal:new_season_check',
    new_volumes_check: 'internal:new_season_check'
}

const TASK_NAMES = Object.keys(TASK_JOB_IDS) as TaskName[]

const TOP_COMMANDS = 10

export type TaskMetric = {
    name: TaskName
    lastRunAt: Date | null
    lastDurationMs: number | null
    lastStatus: string | null
    lastDetail: string | null
    runCount: number
    failCount: number
    nextRunAt: Date | null
}

export type Metrics = {
    generatedAt: Date
    uptimeMs: number
    mode: 'webhook' | 'polling'
    env: string
    users: {
        total: number
        new7d: number
        new30d: number
        active7d: number
        active30d: number
        dormant: number
        trackingSince: Date | null
    }
    anime: { total: number, new7d: number, onAir: number, avgPerUser: number }
    novels: {
        total: number
        new7d: number
        releasing: number
        hardcoverLinked: number
        avgPerUser: number
    }
    groups: { total: number, memberships: number, newest: Date | null }
    reminders: { active: number, expired: number }
    delivered: {
        seasons: { total: number, last7d: number, latest: Date | null }
        volumes: { total: number, last7d: number, latest: Date | null }
    }
    tasks: TaskMetric[]
    commands: {
        total: number
        pendingFlush: number
        top: { command: string, count: number }[]
    }
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

const average = (total: number, users: number) =>
    users < 1 ? 0 : Math.round((total / users) * 10) / 10

const distinctUsers = (...groups: { userId: string }[][]) =>
    new Set(groups.flat().map(row => row.userId)).size

// A purely numeric job date is a one-off timestamp; anything else is a cron expression,
// which never expires. Same predicate /myjobs uses.
const isExpired = (date: string) => /^\d+$/.test(date) && Number(date) < Date.now()

export const collectMetrics = async (): Promise<Metrics> => {
    const day7 = daysAgo(7)
    const day30 = daysAgo(30)

    const [
        usersTotal,
        usersNew7d,
        usersNew30d,
        earliestUser,
        dormantUsers,
        animeTotal,
        animeNew7d,
        animeOnAir,
        novelsTotal,
        novelsNew7d,
        novelsReleasing,
        novelsHardcover,
        groupsTotal,
        groupMemberships,
        newestGroup,
        reminderJobs,
        seasonsTotal,
        seasons7d,
        latestSeason,
        volumesTotal,
        volumes7d,
        latestVolume,
        taskRuns,
        commandUsage,
        animeActive7d,
        novelActive7d,
        animeActive30d,
        novelActive30d
    ] = await prisma.$transaction([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: day7 } } }),
        prisma.user.count({ where: { createdAt: { gte: day30 } } }),
        prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        prisma.user.count({ where: { animes: { none: {} }, novels: { none: {} } } }),
        prisma.anime.count(),
        prisma.anime.count({ where: { createdAt: { gte: day7 } } }),
        prisma.anime.count({ where: { onAir: true } }),
        prisma.novel.count(),
        prisma.novel.count({ where: { createdAt: { gte: day7 } } }),
        prisma.novel.count({ where: { releasing: true } }),
        prisma.novel.count({ where: { detailsProvider: 'hardcover', detailsId: { not: null } } }),
        prisma.notificationGroup.count(),
        prisma.notificationGroup.findMany({ select: { _count: { select: { users: true } } } }),
        prisma.notificationGroup.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        prisma.job.findMany({ where: { NOT: { id: { startsWith: 'internal:' } } }, select: { date: true } }),
        prisma.notificationHistory.count(),
        prisma.notificationHistory.count({ where: { createdAt: { gte: day7 } } }),
        prisma.notificationHistory.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        prisma.volumeNotification.count(),
        prisma.volumeNotification.count({ where: { createdAt: { gte: day7 } } }),
        prisma.volumeNotification.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        prisma.taskRun.findMany(),
        prisma.commandUsage.findMany({ orderBy: { count: 'desc' } }),
        prisma.anime.findMany({ where: { updatedAt: { gte: day7 } }, select: { userId: true }, distinct: ['userId'] }),
        prisma.novel.findMany({ where: { updatedAt: { gte: day7 } }, select: { userId: true }, distinct: ['userId'] }),
        prisma.anime.findMany({ where: { updatedAt: { gte: day30 } }, select: { userId: true }, distinct: ['userId'] }),
        prisma.novel.findMany({ where: { updatedAt: { gte: day30 } }, select: { userId: true }, distinct: ['userId'] })
    ])

    const expired = reminderJobs.filter(job => isExpired(job.date)).length

    const tasks: TaskMetric[] = TASK_NAMES.map(name => {
        const run = taskRuns.find(entry => entry.name === name)
        const job = getScheduled(TASK_JOB_IDS[name])
        const next = job?.nextInvocation()

        return {
            name,
            lastRunAt: run?.lastRunAt ?? null,
            lastDurationMs: run?.lastDurationMs ?? null,
            lastStatus: run?.lastStatus ?? null,
            lastDetail: run?.lastDetail ?? null,
            runCount: run?.runCount ?? 0,
            failCount: run?.failCount ?? 0,
            nextRunAt: next ? new Date(next.getTime()) : null
        }
    })

    return {
        generatedAt: new Date(),
        uptimeMs: Math.round(process.uptime() * 1000),
        mode: process.env.NODE_ENV === 'production' ? 'webhook' : 'polling',
        env: process.env.NODE_ENV ?? 'development',
        users: {
            total: usersTotal,
            new7d: usersNew7d,
            new30d: usersNew30d,
            active7d: distinctUsers(animeActive7d, novelActive7d),
            active30d: distinctUsers(animeActive30d, novelActive30d),
            dormant: dormantUsers,
            trackingSince: earliestUser?.createdAt ?? null
        },
        anime: {
            total: animeTotal,
            new7d: animeNew7d,
            onAir: animeOnAir,
            avgPerUser: average(animeTotal, usersTotal)
        },
        novels: {
            total: novelsTotal,
            new7d: novelsNew7d,
            releasing: novelsReleasing,
            hardcoverLinked: novelsHardcover,
            avgPerUser: average(novelsTotal, usersTotal)
        },
        groups: {
            total: groupsTotal,
            memberships: groupMemberships.reduce((sum, group) => sum + group._count.users, 0),
            newest: newestGroup?.createdAt ?? null
        },
        reminders: {
            active: reminderJobs.length - expired,
            expired
        },
        delivered: {
            seasons: { total: seasonsTotal, last7d: seasons7d, latest: latestSeason?.createdAt ?? null },
            volumes: { total: volumesTotal, last7d: volumes7d, latest: latestVolume?.createdAt ?? null }
        },
        tasks,
        commands: {
            total: commandUsage.reduce((sum, entry) => sum + entry.count, 0),
            pendingFlush: pendingCommandCount(),
            top: commandUsage.slice(0, TOP_COMMANDS).map(entry => ({
                command: entry.command,
                count: entry.count
            }))
        }
    }
}
