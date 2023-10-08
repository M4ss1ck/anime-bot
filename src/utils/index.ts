import { prisma } from "../db/prisma.js"
import { scheduled } from "../scheduler/index.js"
import type { Telegraf } from "telegraf"
import { Markup } from "telegraf"
import { logger } from "../logger/index.js"
import dayjs from 'dayjs'

export const padTo2Digits = (num: number) => {
    return num.toString().padStart(2, '0')
}

export const convertMsToTime = (milliseconds: number) => {
    let seconds = Math.floor(milliseconds / 1000)
    let minutes = Math.floor(seconds / 60)
    let hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    seconds = seconds % 60
    minutes = minutes % 60
    hours = hours % 24

    return `${days}:${padTo2Digits(hours)}:${padTo2Digits(minutes)}:${padTo2Digits(
        seconds,
    )}`
}

export const convertMsToRelativeTime = (milliseconds: number) => {
    let seconds = Math.floor(milliseconds / 1000)
    let minutes = Math.floor(seconds / 60)
    let hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    seconds = seconds % 60
    minutes = minutes % 60
    hours = hours % 24

    return `${days > 0 ? days + ' day(s) ' : ''}${hours > 0 ? hours + ' h ' : ''}${minutes > 0 ? minutes + ' min ' : ''}${seconds > 0 ? seconds + ' s' : ''}`
}

export const runScheduled = async (bot: Telegraf) => {
    const jobs = await prisma.job.findMany()
    for (const job of jobs) {
        const userId = job.id.split(':').pop()
        if (userId) {
            const buttons = []
            // check if job id starts with anime id
            if (/^\d+$/g.test(job.id.split(':')[0])) {
                const animeId = job.id.split(':')[0]
                const date = job.id.split(':')[1]
                buttons.push(Markup.button.callback('Repeat next week', `a_scheduler:${animeId}:${dayjs(Number(date)).add(7, 'days').valueOf()}:${userId}`))
            } else {
                const date = job.id.split(':')[1]
                buttons.push(Markup.button.callback('Is date correct?', `check_date:${date}`))
            }
            const keyboard = Markup.inlineKeyboard(buttons)
            const jobText = await scheduled(job.id, /^\d+$/.test(job.date) ? Number(job.date) : job.date, () => {
                bot.telegram.sendMessage(userId, job.text, keyboard)
            }, job.text)
            logger.success(jobText, '\n', job.text)
        }
    }
}

/**
 * Escape common characters for HTML
 * @param {String} s text to escape
 * @returns parsed text
 */
export const escape = (s: string) => {
    const lookup: Record<string, string> = {
        ['&']: "&amp;",
        ['"']: "&quot;",
        ['\'']: "&apos;",
        ['<']: "&lt;",
        ['>']: "&gt;"
    };
    return s.replace(/<(\/)?\w+>/g, '').replace(/[&"'<>]/g, c => lookup[c]);
}
