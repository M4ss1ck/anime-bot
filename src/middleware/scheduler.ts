import { Composer, Markup } from "telegraf"
import { prisma } from "../db/prisma.js"
import { scheduled, getScheduled } from "../scheduler/index.js"
import { logger } from "../logger/index.js"
import { getAnime } from "../anilist-service/index.js"
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime.js'

dayjs.extend(relativeTime)

export const scheduler = new Composer()

scheduler.command('now', async ctx => {
    ctx
        .reply(`Dayjs: ${dayjs()} (${dayjs().valueOf()})\nDate: ${new Date()} (${new Date().getTime()})`)
        .catch(e => logger.error(e))
})

// scheduler.command('ping5', async ctx => {
//     // const date = Date.now() + 5000
//     const id = `ping5:${ctx.from.id}`
//     const keyboard = Markup.inlineKeyboard([
//         Markup.button.callback('Cancel', `cancel:${id}`)
//     ])
//     const jobText = await scheduled(id, `*/5 * * * * *`, () => {
//         ctx
//             .reply('Ping back', keyboard)
//             .catch(e => logger.error(e))
//     })
//     logger.info(jobText)
// })

scheduler.command('tping', async ctx => {
    const id = `tping:${ctx.from.id}`
    const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('Cancel', `cancel:${id}`)
    ])
    const future = dayjs().add(15, 's')
    ctx
        .reply(`Should ping in 15s at ${future.toString()}`, keyboard)
        .catch(e => logger.error(e))
    const jobText = await scheduled(id, future.valueOf(), () => {
        ctx
            .reply(`Should have ping at ${future.toString()}`, keyboard)
            .catch(e => logger.error(e))
    })
    logger.info(jobText)
})

scheduler.action(/cancel:/i, async ctx => {
    await ctx.answerCbQuery().catch(e => logger.error(e))
    const jobId = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data.replace('cancel:', '') : ''
    const job = getScheduled(jobId)
    // logger.info(job)
    if (job) {
        job.cancel()
        await prisma.job.delete({
            where: {
                id: jobId
            }
        }).catch(() => logger.info('Couldn\'t delete job from DB'))

        ctx
            .reply(`Scheduled job "${jobId}" was canceled`)
            .catch(e => logger.error(e))
    } else {
        ctx
            .reply(`Error 404: Job not found`)
            .catch(e => logger.error(e))
    }
})

scheduler.action(/check_date:/i, async ctx => {
    await ctx.answerCbQuery().catch(e => logger.error(e))
    if ('data' in ctx.callbackQuery) {
        const date = ctx.callbackQuery.data.replace('check_date:', '')
        const text = /^\d+$/.test(date)
            ? `This job should run at ${dayjs(Number(date))} <i>(${dayjs(Number(date)).fromNow()})</i>`
            : `This job uses no date, but a cron expression: <i>${date}</i>`

        ctx.replyWithHTML(text).catch(e => logger.error(e))
    }
})

scheduler.action(/a_scheduler:/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [animeId, date, userId] = ctx.callbackQuery.data.replace('a_scheduler:', '').split(':')
        if (animeId && userId && date) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your list').catch(e => logger.error(e))
                return
            }

            await ctx.answerCbQuery().catch(e => logger.error(e))

            const anime = await getAnime(Number(animeId))
            if (!anime) await ctx.answerCbQuery('No anime found!').catch(logger.error)

            const jobId = `${animeId}:${date}:${userId}`

            const keyboard = Markup.inlineKeyboard([
                Markup.button.callback('Repeat next week', `a_scheduler:${animeId}:${dayjs(Number(date)).add(7, 'days').valueOf()}:${userId}`)
            ])

            const jobText = await scheduled(jobId, /^\d+$/.test(date) ? Number(date) : date, () => {
                ctx.telegram.sendMessage(userId, `This is your reminder for anime ${anime.Media.title.english ?? 'n/a'}`, keyboard)
            }, `This is your reminder for anime ${anime.Media.title.english ?? 'n/a'}`)

            !ctx.callbackQuery.inline_message_id
                ? ctx.telegram.sendMessage(userId, `Reminder for anime ${anime.Media.title.english ?? 'n/a'}\n${jobText}`)
                : ctx.editMessageCaption(`Reminder for anime ${anime.Media.title.english ?? 'n/a'}\n${jobText}`)
        }
    }
})

/**
 * Usage: /reminder <date or cron expression> - <text>
 */
scheduler.command('reminder', async ctx => {
    if (ctx.message.text) {
        const [date, text] = ctx.message.text.replace(/^\/reminder(@\w+)?\s/i, '').split(' - ')
        const userId = ctx.from.id
        if (text && userId && date) {
            const jobId = `custom:${date}:${userId}`
            const keyboard = Markup.inlineKeyboard([
                Markup.button.callback('Cancel', `cancel:${jobId}`),
                Markup.button.callback('Check date', `check_date:${date}`)
            ])
            const jobText = await scheduled(jobId, /^\d+$/.test(date) ? Number(date) : date, () => {
                ctx.telegram.sendMessage(userId, text, keyboard)
            }, text)

            ctx.telegram.sendMessage(userId, `${text}\n${jobText}`, keyboard)
        }
    }
})

scheduler.command(['myjobs', 'myreminders'], async ctx => {
    const userId = ctx.from.id.toString()
    const jobs = await prisma.job.findMany({
        where: {
            id: {
                endsWith: userId
            }
        }
    })
    const filteredJobs = jobs.filter(job => !/^\d+$/g.test(job.date) || dayjs(Number(job.date)).isAfter(dayjs()))
    const buttons = filteredJobs.map(job => {
        return ([
            Markup.button.callback(`Cancel ${job.text.replace('This is your ', '')}`, `cancel:${job.id}`)
        ])
    }
    )
    const keyboard = Markup.inlineKeyboard(buttons)

    const text = filteredJobs.length > 0
        ? `<b>Your reminders:</b>\n${filteredJobs.map(job => `[${/^\d+$/.test(job.date) ? dayjs(Number(job.date)).fromNow() : job.date}] <i>${job.text}</i>`).join('\n')}`
        : 'You have no reminders currently active'

    ctx.replyWithHTML(text, keyboard)
})

scheduler.command('convert', async ctx => {
    const date = ctx.message.text.replace(/^\/convert(@\w+)?\s/, '')
    const text = `<b>${date}</b>\nDate: ${dayjs(date)}\nMilliseconds: ${dayjs(date).valueOf()}`
    ctx.replyWithHTML(text).catch(logger.error)
})