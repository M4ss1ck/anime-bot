import { prisma } from "../db/prisma.js"
import { scheduled } from "../scheduler/index.js"
import type { Bot } from "grammy"
import { InlineKeyboard } from "grammy"
import { logger } from "../logger/index.js"
import dayjs from 'dayjs'
import { sendDailySummaries } from "../middleware/notify.js"
import { checkNewSeasons, checkNewNovelReleases } from "../middleware/notifications.js"

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

export const runScheduled = async (bot: Bot) => {
    logger.info('Re-scheduling jobs from database...');
    const jobs = await prisma.job.findMany()
    let reScheduledCount = 0;
    for (const job of jobs) {
        const userId = job.id.split(':').pop()
        if (!userId) {
            logger.warn(`Skipping job with invalid ID format: ${job.id}`);
            continue;
        }

        // Skip internal jobs (like our daily summary) if they were persisted
        if (job.id.startsWith('internal:')) {
            logger.info(`Skipping re-scheduling of internal job: ${job.id}`);
            continue;
        }

        try {
            let keyboard: InlineKeyboard | undefined
            // check if job id starts with anime id (for anime reminders)
            if (/^\d+:/g.test(job.id)) {
                const [animeId, date] = job.id.split(':');
                keyboard = new InlineKeyboard()
                    .text('Repeat next week', `a_scheduler:${animeId}:${dayjs(Number(date)).add(7, 'days').valueOf()}:${userId}`)
            } else if (job.id.startsWith('custom:')) {
                const date = job.id.split(':')[1]
                keyboard = new InlineKeyboard()
                    .text('Cancel Reminder', `cancel:${job.id}`)
                    .text('Check date', `check_date:${date}`)
            }
            // Add more conditions here if other job types exist

            const callback = () => {
                bot.api.sendMessage(userId, job.text, { reply_markup: keyboard }).catch(err => {
                    logger.error(`Error sending scheduled message for job ${job.id} to user ${userId}:`, err);
                    // Consider removing job if user blocked bot, etc.
                });
            }

            // Call scheduled without assigning the result if jobText is not used
            await scheduled(
                job.id,
                /^\d+$/.test(job.date) ? Number(job.date) : job.date,
                callback,
                job.text
            )
            reScheduledCount++;
        } catch (error) {
            logger.error(`Failed to re-schedule job ${job.id}:`, error);
        }
    }
    logger.info(`Re-scheduled ${reScheduledCount} jobs from database.`);

    // --- Schedule the Daily Anime Summary --- 
    try {
        logger.info('Scheduling daily anime summary job...');
        const dailySummaryJobId = 'internal:daily_summary';
        const cronExpression = '0 9 * * *'; // Run daily at 9:00 AM server time

        await scheduled(
            dailySummaryJobId,
            cronExpression,
            () => sendDailySummaries(bot.api),
            'Daily Anime Summary Generation' // Optional description
        );
        logger.success(`Scheduled daily anime summary with ID: ${dailySummaryJobId} (${cronExpression})`);
    } catch (error) {
        logger.error('Failed to schedule the daily anime summary job:', error);
    }
    // --- End Daily Summary Scheduling ---

    // --- Schedule New Season Check ---
    try {
        logger.info('Scheduling new season check job...');
        const newSeasonCheckJobId = 'internal:new_season_check';
        const cronExpression = '0 8 * * *'; // Run daily at 8:00 AM server time

        await scheduled(
            newSeasonCheckJobId,
            cronExpression,
            () => {
                checkNewSeasons(bot.api)
                checkNewNovelReleases(bot.api)
            },
            'New Season/Novel Check'
        );
        logger.success(`Scheduled new season check with ID: ${newSeasonCheckJobId} (${cronExpression})`);
    } catch (error) {
        logger.error('Failed to schedule the new season check job:', error);
    }
    // --- End New Season Check Scheduling ---
}

export const escapeHtml = (s: string) => {
    const lookup: Record<string, string> = {
        '&': "&amp;",
        '"': "&quot;",
        "'": "&apos;",
        '<': "&lt;",
        '>': "&gt;"
    };
    return s.replace(/[&"'<>]/g, c => lookup[c]);
}

/** @deprecated Use escapeHtml for HTML contexts, encodeURIComponent for callback data */
export const escape = escapeHtml
