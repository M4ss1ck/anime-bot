import { Composer } from 'grammy'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime.js'
import { collectMetrics } from '../metrics/collect.js'
import type { Metrics, TaskMetric } from '../metrics/collect.js'
import { convertMsToRelativeTime, escapeHtml } from '../utils/index.js'
import { logger } from '../logger/index.js'

dayjs.extend(relativeTime)

const adminID = process.env.ADMIN_ID ?? '123'

const metrics = new Composer()

const date = (value: Date | null) => value ? dayjs(value).format('YYYY-MM-DD') : 'never'

const seconds = (ms: number | null) => ms === null ? '' : `${(ms / 1000).toFixed(1)}s`

const formatTask = (task: TaskMetric) => {
    const next = task.nextRunAt ? ` · next ${dayjs(task.nextRunAt).fromNow()}` : ''

    if (!task.lastRunAt) return `<code>${task.name}</code> — never run${next}`

    const status = task.lastStatus === 'failed' ? '❌' : '✅'
    const detail = task.lastDetail ? ` · "${escapeHtml(task.lastDetail)}"` : ''

    return `<code>${task.name}</code> — ${dayjs(task.lastRunAt).fromNow()} ${status} ${seconds(task.lastDurationMs)}`
        + ` · ${task.runCount} runs / ${task.failCount} failed${detail}${next}`
}

export const formatMetrics = (data: Metrics): string => {
    const { users, anime, novels, groups, reminders, delivered, commands } = data

    const topCommands = commands.top.length > 0
        ? commands.top.map(entry => `/${escapeHtml(entry.command)} ${entry.count}`).join(' · ')
        : 'no commands recorded yet'

    return [
        `📊 <b>Bot Metrics</b> — ${convertMsToRelativeTime(data.uptimeMs) || '0 s'} up · ${data.mode} · ${data.env}`,
        '',
        `👥 <b>Users</b> · ${users.total} total (+${users.new7d} / 7d, +${users.new30d} / 30d)`,
        `Active: ${users.active7d} / 7d · ${users.active30d} / 30d · dormant: ${users.dormant}`,
        `Growth tracked since ${date(users.trackingSince)}`,
        '',
        `📺 <b>Anime</b> · ${anime.total} (+${anime.new7d} / 7d) · on air: ${anime.onAir} · ${anime.avgPerUser} avg/user`,
        `📚 <b>Novels</b> · ${novels.total} (+${novels.new7d} / 7d) · releasing: ${novels.releasing} · ${novels.avgPerUser} avg/user`,
        `   Hardcover-linked: ${novels.hardcoverLinked} — only these get volume checks`,
        '',
        `👥 <b>Groups</b> · ${groups.total} · memberships: ${groups.memberships} · newest ${date(groups.newest)}`,
        `⏰ <b>Reminders</b> · ${reminders.active} active · ${reminders.expired} expired`,
        '',
        '🔔 <b>Delivered</b>',
        `New seasons: ${delivered.seasons.total} (${delivered.seasons.last7d} / 7d) · last ${date(delivered.seasons.latest)}`,
        `New volumes: ${delivered.volumes.total} (${delivered.volumes.last7d} / 7d) · last ${date(delivered.volumes.latest)}`,
        '',
        '⚙️ <b>Scheduled tasks</b>',
        ...data.tasks.map(formatTask),
        '',
        `⌨️ <b>Commands</b> · ${commands.total} total · ${commands.pendingFlush} pending flush`,
        topCommands
    ].join('\n')
}

metrics.filter(ctx => ctx.from?.id === Number(adminID)).command('metrics', async ctx => {
    try {
        const data = await collectMetrics()
        await ctx.reply(formatMetrics(data), {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true }
        })
    } catch (error) {
        logger.error(error)
        await ctx.reply('❌ Failed to collect metrics: ' + String(error))
    }
})

export default metrics
