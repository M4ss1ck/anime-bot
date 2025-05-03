import { Composer, Context, Telegraf } from 'telegraf';
import { logger } from '../logger/index.js';
import { prisma } from '../db/prisma.js'; // Import Prisma client
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(isBetween);
dayjs.extend(utc); // Use UTC or server's local time consistently

// --- Refined Anime Service Function ---
/**
 * Finds anime from a user's reminders (Jobs) scheduled to air on a specific day.
 * @param userId The user's ID (string).
 * @param targetDay Optional dayjs object representing the target day. Defaults to today.
 * @returns Array of strings formatted as "Anime Name - Ep X".
 */
async function getUserAiringToday(userId: string, targetDay?: dayjs.Dayjs): Promise<string[]> {
    // Use the provided targetDay or default to the current day (UTC)
    const checkDay = targetDay ? targetDay.utc() : dayjs().utc();
    const dayStart = checkDay.startOf('day');
    const dayEnd = checkDay.endOf('day');
    const airingTodayStrings: string[] = [];

    try {
        // Find jobs associated with the user that represent anime reminders
        const userJobs = await prisma.job.findMany({
            where: {
                id: {
                    endsWith: `:${userId}`,
                }
            },
        });

        const animeJobs = userJobs.filter(job => /^\d+:/.test(job.id));
        // logger.debug(`Found ${animeJobs.length} potential anime jobs for user ${userId}`);

        for (const job of animeJobs) {
            try {
                const parts = job.id.split(':');
                if (parts.length < 3) continue; // Invalid format

                const animeIdStr = parts[0];
                const dateStr = parts[1];
                const animeId = parseInt(animeIdStr, 10);
                const scheduledTimestamp = parseInt(dateStr, 10);

                if (isNaN(animeId) || isNaN(scheduledTimestamp)) {
                    logger.warn(`Invalid job ID format encountered: ${job.id}`);
                    continue;
                }

                const scheduledDate = dayjs.utc(scheduledTimestamp); // Treat timestamp as UTC

                // Check if the scheduled time falls within the target day's range
                if (scheduledDate.isBetween(dayStart, dayEnd, 'day', '[]')) {
                    const anime = await prisma.anime.findFirst({
                        where: {
                            id: animeId,
                            userId: userId,
                        }
                    });

                    if (anime) {
                        // Assuming 'episode' stores the last watched episode number
                        const nextEpisode = anime.episode + 1;
                        const formattedString = `${anime.name} - Ep ${nextEpisode}`;
                        airingTodayStrings.push(formattedString);
                        // logger.debug(`Adding anime to today's list: ${formattedString}`);
                    } else {
                        logger.warn(`Could not find Anime record for ID ${animeId} from job ${job.id} for user ${userId}`);
                    }
                }
            } catch (parseError) {
                logger.error(`Error processing job ${job.id}:`, parseError);
            }
        }
    } catch (error) {
        logger.error(`Failed to fetch or process jobs for user ${userId}:`, error);
    }

    // logger.debug(`Final list for user ${userId} today: ${airingTodayStrings}`);
    return airingTodayStrings;
}
// --- End Refined Function ---

/**
 * Helper function to ensure a user exists in the database.
 * Uses upsert for efficiency.
 * @param userId The Telegram user ID (as a number).
 * @param userName The user's first name (for logging).
 */
async function ensureUserExists(userId: number, userName: string): Promise<void> {
    const userIdStr = userId.toString();
    try {
        await prisma.user.upsert({
            where: { id: userIdStr },
            update: {}, // No fields to update if user exists
            create: { id: userIdStr },
        });
    } catch (error) {
        logger.error(`Failed to ensure user ${userIdStr} (${userName}) exists:`, error);
        // Rethrow or handle as needed, maybe prevent further action
        throw new Error(`Could not ensure user ${userName} exists.`);
    }
}

const composer = new Composer<Context>();

// Command: /notify
composer.command('notify', async (ctx) => {
    if (!ctx.chat || ctx.chat.type === 'private') {
        return ctx.reply('This command can only be used in groups.');
    }

    const groupId = ctx.chat.id.toString(); // Use string for Prisma ID
    const userId = ctx.from.id;
    const userIdStr = userId.toString();
    const userName = ctx.from.first_name;

    try {
        // Ensure the user exists in the DB first
        await ensureUserExists(userId, userName);

        // Find the notification group for this chat - Use const as it's not reassigned
        const group = await prisma.notificationGroup.findUnique({
            where: { groupId },
            include: { users: { select: { id: true } } } // Select only IDs for efficiency
        });

        let replyMessage = '';
        let addedNew = false;

        if (group) {
            // Group exists, check if user is already in it
            const isUserAlreadyIn = group.users.some(user => user.id === userIdStr);

            if (isUserAlreadyIn) {
                replyMessage = `${userName}, you are already set up for daily anime notifications in this group.`;
            } else {
                // Add user to the existing group
                await prisma.notificationGroup.update({
                    where: { groupId },
                    data: {
                        users: {
                            connect: { id: userIdStr }
                        }
                    }
                });
                logger.info(`User ${userIdStr} (${userName}) added to notifications for group ${groupId} via /notify`);
                replyMessage = `${userName}, you've been added to the daily anime notifications for this group.`;
                addedNew = true;
            }
        } else {
            // Group doesn't exist, create it and connect the current user
            const newGroup = await prisma.notificationGroup.create({
                data: {
                    groupId: groupId,
                    users: {
                        connect: { id: userIdStr }
                    }
                },
            });
            logger.info(`Notification activated for group ${groupId} (DB ID: ${newGroup.id}) by user ${userIdStr} (${userName})`);
            replyMessage = `Daily anime notifications activated for this group! ${userName}, you've been automatically added. Others can join using <code>/opt_in</code>.`;
            addedNew = true;
        }

        // Send the primary confirmation message
        await ctx.reply(replyMessage, { parse_mode: 'HTML' });

        // If the user was newly added, send a sample message for today
        if (addedNew) {
            const userAnimeToday = await getUserAiringToday(userIdStr);
            if (userAnimeToday.length > 0) {
                let sampleMessage = `👀 Here's a sample of what you might see today:
`;
                userAnimeToday.forEach(anime => sampleMessage += `\n- ${anime}`);
                sampleMessage += `\n\n(This is just a preview based on your current reminders. The full daily summary includes everyone who opted in.)`;
                await ctx.reply(sampleMessage).catch(e => logger.error(`Failed to send sample notify message to group ${groupId}`, e));
            } else {
                await ctx.reply(`(Based on your current reminders, it looks like nothing is scheduled for you today.)`).catch(e => logger.error(`Failed to send empty sample notify message to group ${groupId}`, e));
            }
        }
    } catch (error) {
        logger.error(`Error handling /notify in group ${groupId} for user ${userIdStr}:`, error);
        if (error instanceof Error && error.message.includes('Could not ensure user')) {
            return ctx.reply(`Sorry ${userName}, there was a problem setting up your user account. Please try again later.`);
        }
        return ctx.reply('Sorry, something went wrong while activating notifications.');
    }
});

// Command: /opt_in
composer.command('opt_in', async (ctx) => {
    if (!ctx.chat || ctx.chat.type === 'private') {
        return ctx.reply('This command can only be used in groups.');
    }

    const groupId = ctx.chat.id.toString();
    const userId = ctx.from.id;
    const userIdStr = userId.toString();
    const userName = ctx.from.first_name;

    try {
        // Ensure the user exists in the DB first
        await ensureUserExists(userId, userName);

        // Find the group
        const group = await prisma.notificationGroup.findUnique({
            where: { groupId },
            include: { users: { select: { id: true } } }
        });

        if (!group) {
            return ctx.reply('Daily notifications haven\'t been activated in this group yet. Use /notify first.');
        }

        // Check if user is already in
        const isUserAlreadyIn = group.users.some(user => user.id === userIdStr);

        if (isUserAlreadyIn) {
            return ctx.reply(`${userName}, you are already receiving daily notifications in this group.`);
        } else {
            // Add user to the existing group
            await prisma.notificationGroup.update({
                where: { groupId: groupId },
                data: {
                    users: {
                        connect: { id: userIdStr }
                    }
                }
            });
            logger.info(`User ${userIdStr} (${userName}) opted into notifications for group ${groupId}`);
            return ctx.reply(`${userName}, you've opted in! You'll receive daily anime notifications.`);
        }

    } catch (error) {
        logger.error(`Error handling /opt_in in group ${groupId} for user ${userIdStr}:`, error);
        if (error instanceof Error && error.message.includes('Could not ensure user')) {
            return ctx.reply(`Sorry ${userName}, there was a problem setting up your user account. Please try again later.`);
        }
        return ctx.reply('Sorry, something went wrong while opting you in.');
    }
});

// Command: /notify_on <day>
composer.command('notify_on', async (ctx) => {
    if (!ctx.chat || ctx.chat.type === 'private') {
        return ctx.reply('This command can only be used in groups.');
    }

    const groupId = ctx.chat.id.toString();
    const messageText = ctx.message.text;
    const requestedDay = messageText.split(' ')[1]?.toLowerCase();

    if (!requestedDay) {
        return ctx.reply('Please specify a day of the week (e.g., /notify_on monday).');
    }

    // Map day names to dayjs day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
    const dayMap: { [key: string]: number } = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
    };

    const targetDayNumber = dayMap[requestedDay];

    if (targetDayNumber === undefined) {
        return ctx.reply('Invalid day of the week. Please use Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, or Saturday.');
    }

    try {
        const group = await prisma.notificationGroup.findUnique({
            where: { groupId },
            include: { users: { select: { id: true } } } // Need user IDs
        });

        if (!group) {
            return ctx.reply('Daily notifications haven\'t been activated in this group yet. Use /notify first.');
        }

        const userIds = group.users.map(u => u.id);
        if (!userIds || userIds.length === 0) {
            return ctx.reply('No users have opted into notifications in this group yet.');
        }
        const today = dayjs().utc();
        let targetDate = today.day(targetDayNumber);
        if (targetDate.isBefore(today, 'day') || targetDate.isSame(today, 'day')) {
            targetDate = targetDate.add(1, 'week');
        }
        const allUsersAnimeFuture: string[] = [];
        for (const userId of userIds) {
            try {
                const userAnime = await getUserAiringToday(userId, targetDate);
                if (userAnime && userAnime.length > 0) {
                    allUsersAnimeFuture.push(...userAnime);
                }
            } catch (err) {
                logger.error(`Failed to get future anime for user ${userId} in group ${groupId}:`, err);
            }
        }

        // Remove duplicates
        const uniqueAnime = [...new Set(allUsersAnimeFuture)];

        const formattedDate = targetDate.format('dddd, MMMM D');

        if (uniqueAnime.length > 0) {
            let message = `🗓️ Anime Summary for ${formattedDate} 🗓️\n\nBased on opted-in users, here's what might air:
`;
            uniqueAnime.forEach(anime => message += `\n- ${anime}`);
            await ctx.reply(message);
        } else {
            await ctx.reply(`Looks like nothing is scheduled for opted-in users on ${formattedDate}.`);
        }

    } catch (error) {
        logger.error(`Error handling /notify_on in group ${groupId}:`, error);
        return ctx.reply('Sorry, something went wrong while fetching the future schedule.');
    }
});

/**
 * Generates and sends daily anime summaries to subscribed groups.
 * This function should be scheduled to run daily.
 * @param bot The Telegraf bot instance.
 */
export async function sendDailySummaries(bot: Telegraf<Context>) {
    logger.info('Starting daily summary generation task...');
    try {
        const groups = await prisma.notificationGroup.findMany({
            include: {
                users: { select: { id: true } }
            }
        });

        if (!groups || groups.length === 0) {
            logger.info('No groups subscribed to daily notifications.');
            return;
        }

        logger.info(`Found ${groups.length} groups for daily summaries.`);

        for (const group of groups) {
            const groupId = group.groupId;
            const groupDbId = group.id;
            const userIds = group.users.map(u => u.id);

            if (!userIds || userIds.length === 0) {
                logger.warn(`Skipping group ${groupId} (DB ID: ${groupDbId}) as it has no opted-in users.`);
                continue;
            }
            const allUsersAnimeToday: string[] = [];
            for (const userId of userIds) {
                try {
                    const userAnime = await getUserAiringToday(userId);
                    if (userAnime && userAnime.length > 0) {
                        allUsersAnimeToday.push(...userAnime); // More efficient push
                    }
                } catch (err) {
                    logger.error(`Failed to get anime for user ${userId} in group ${groupId}:`, err);
                }
            }
            const uniqueAnime = [...new Set(allUsersAnimeToday)];

            if (uniqueAnime.length > 0) {
                let message = '☀️ Daily Anime Summary ☀️\n\nBased on opted-in users, here are some anime episodes potentially available today:\n';
                uniqueAnime.forEach(anime => message += `\n- ${anime}`); // Format: Anime Title - Ep X
                message += '\n\nEnjoy your watch!';

                try {
                    await bot.telegram.sendMessage(groupId, message);
                    logger.info(`Sent daily summary to group ${groupId} (${uniqueAnime.length} unique items).`);
                } catch (error: any) {
                    logger.error(`Failed to send summary to group ${groupId}: ${error.message || error}`);
                    if (error.response?.error_code === 403 || error.message?.includes('chat not found') || error.message?.includes('bot was kicked')) {
                        logger.warn(`Bot might be blocked or kicked from group ${groupId}. Removing group from notifications.`);
                        try {
                            await prisma.notificationGroup.delete({ where: { id: groupDbId } });
                            logger.info(`Removed notification group ${groupId} (DB ID: ${groupDbId})`);
                        } catch (removeError) {
                            logger.error(`Failed to remove inactive group ${groupId} (DB ID: ${groupDbId}) from notifications:`, removeError);
                        }
                    }
                    else if (error.response?.error_code === 429) {
                        logger.warn(`Rate limited while sending to group ${groupId}. Retrying or delaying might be needed.`);
                    }
                }
            } else {
                logger.info(`No relevant anime found today for any user in group ${groupId}. Summary skipped.`);
            }
        }
        logger.info('Finished daily summary generation task.');
    } catch (error) {
        logger.error('Critical error during daily summary generation task:', error);
    }
}

export default composer;
