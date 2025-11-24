import { prisma } from "../db/prisma.js"
import { scheduled } from "../scheduler/index.js"
import type { Telegraf } from "telegraf"
import { Markup } from "telegraf"
import { logger } from "../logger/index.js"
import dayjs from 'dayjs'
import { sendDailySummaries } from "../middleware/notify.js"
import { checkNewSeasons } from "../middleware/notifications.js"

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
            const buttons = []
            // check if job id starts with anime id (for anime reminders)
            if (/^\d+:/g.test(job.id)) {
                const [animeId, date] = job.id.split(':');
                buttons.push(Markup.button.callback('Repeat next week', `a_scheduler:${animeId}:${dayjs(Number(date)).add(7, 'days').valueOf()}:${userId}`))
            } else if (job.id.startsWith('custom:')) {
                const date = job.id.split(':')[1]
                buttons.push(Markup.button.callback('Cancel Reminder', `cancel:${job.id}`))
                buttons.push(Markup.button.callback('Check date', `check_date:${date}`))
            }
            // Add more conditions here if other job types exist

            const keyboard = buttons.length > 0 ? Markup.inlineKeyboard(buttons) : undefined;

            const callback = () => {
                bot.telegram.sendMessage(userId, job.text, keyboard).catch(err => {
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
            // logger.success(`Re-scheduled: ${jobText}`); // Original log (commented out)
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

        // Check if the job already exists (e.g., from a previous run within the same process lifetime)
        // Note: This check might be redundant if `scheduled` handles overwriting or prevents duplicates.
        // const existingJob = getScheduled(dailySummaryJobId); // Assumes getScheduled is available/imported

        // if (!existingJob) { 
        await scheduled(
            dailySummaryJobId,
            cronExpression,
            () => sendDailySummaries(bot),
            'Daily Anime Summary Generation' // Optional description
        );
        logger.success(`Scheduled daily anime summary with ID: ${dailySummaryJobId} (${cronExpression})`);
        // } else {
        //     logger.info(`Daily summary job (${dailySummaryJobId}) already scheduled.`);
        // }
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
            () => checkNewSeasons(bot),
            'New Season Check'
        );
        logger.success(`Scheduled new season check with ID: ${newSeasonCheckJobId} (${cronExpression})`);
    } catch (error) {
        logger.error('Failed to schedule the new season check job:', error);
    }
    // --- End New Season Check Scheduling ---
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
