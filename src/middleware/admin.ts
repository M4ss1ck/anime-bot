import { Composer } from "telegraf"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import axios from "axios"

import * as fs from 'fs/promises'

const adminID = process.env.ADMIN_ID ?? '123'

const admin = new Composer()

admin.command('users', Composer.acl(Number(adminID), async ctx => {
    const fileName = `${Date.now()}_userlist.txt`
    const users = await prisma.user.findMany({
        include: {
            animes: true,
        }
    })

    const animelist = users.map(user => `${user.id} (${user.animes.length} anime)`).join('\n')

    await fs.writeFile(fileName, animelist)

    await ctx.replyWithDocument({ source: fileName, filename: fileName }, { caption: 'List of users' })

    await fs.unlink(fileName).catch(logger.error)
}))

// Export entire database to JSON file (uses raw SQL to handle schema mismatches)
admin.command('dbexport', Composer.acl(Number(adminID), async ctx => {
    try {
        await ctx.reply('📦 Exporting database using raw SQL...')

        // Helper function to safely query a table (returns empty array if table doesn't exist)
        const safeQuery = async <T>(table: string): Promise<T[]> => {
            try {
                return await prisma.$queryRawUnsafe<T[]>(`SELECT * FROM ${table}`)
            } catch (error) {
                logger.warn(`Table ${table} not found or error querying: ${error}`)
                return []
            }
        }

        // Use raw SQL queries to export data regardless of Prisma client schema
        const users = await safeQuery<{ id: string }>('User')
        const animes = await safeQuery<Record<string, unknown>>('Anime')
        const novels = await safeQuery<Record<string, unknown>>('Novel')
        const jobs = await safeQuery<Record<string, unknown>>('Job')
        const notificationGroups = await safeQuery<Record<string, unknown>>('NotificationGroup')
        const notificationHistory = await safeQuery<Record<string, unknown>>('NotificationHistory')

        // Get the many-to-many relationship between Users and NotificationGroups
        const userNotificationGroups = await safeQuery<{ A: string, B: number }>('_NotificationGroupToUser')

        // Build export object
        const exportData = {
            exportedAt: new Date().toISOString(),
            version: '1.0.0',
            counts: {
                users: users.length,
                animes: animes.length,
                novels: novels.length,
                jobs: jobs.length,
                notificationGroups: notificationGroups.length,
                notificationHistory: notificationHistory.length,
            },
            data: {
                users: users.map(u => ({
                    id: u.id,
                    // Find notification groups for this user from the junction table
                    notificationGroupIds: userNotificationGroups
                        .filter(ung => ung.A === u.id)
                        .map(ung => {
                            const ng = notificationGroups.find(g => g.id === ung.B)
                            return ng?.groupId as string
                        })
                        .filter(Boolean)
                })),
                animes: animes.map(a => ({
                    id: a.id,
                    name: a.name,
                    anilistId: a.anilistId ?? null,
                    season: a.season,
                    episode: a.episode,
                    onAir: a.onAir ?? false,
                    note: a.note ?? null,
                    userId: a.userId,
                    updatedAt: a.updatedAt ?? null,
                })),
                novels: novels.map(n => ({
                    id: n.id,
                    name: n.name,
                    anilistId: n.anilistId ?? null,
                    volume: n.volume ?? null,
                    chapter: n.chapter ?? null,
                    part: n.part ?? null,
                    releasing: n.releasing ?? false,
                    note: n.note ?? '',
                    userId: n.userId,
                    updatedAt: n.updatedAt ?? null,
                })),
                jobs: jobs.map(j => ({
                    id: j.id,
                    date: j.date,
                    text: j.text,
                })),
                notificationGroups: notificationGroups.map(ng => ({
                    id: ng.id,
                    groupId: ng.groupId,
                    // Find users for this notification group from the junction table
                    userIds: userNotificationGroups
                        .filter(ung => ung.B === ng.id)
                        .map(ung => ung.A),
                    createdAt: ng.createdAt,
                    updatedAt: ng.updatedAt,
                })),
                notificationHistory: notificationHistory.map(nh => ({
                    id: nh.id,
                    userId: nh.userId,
                    animeId: nh.animeId,
                    createdAt: nh.createdAt,
                })),
            }
        }

        // Write to file and send
        const fileName = `db-export-${Date.now()}.json`
        await fs.writeFile(fileName, JSON.stringify(exportData, null, 2))

        const summary = `📊 Export Summary:
• Users: ${exportData.counts.users}
• Animes: ${exportData.counts.animes}
• Novels: ${exportData.counts.novels}
• Jobs: ${exportData.counts.jobs}
• Notification Groups: ${exportData.counts.notificationGroups}
• Notification History: ${exportData.counts.notificationHistory}`

        await ctx.replyWithDocument(
            { source: fileName, filename: fileName },
            { caption: `✅ Database exported successfully!\n\n${summary}` }
        )

        await fs.unlink(fileName).catch(logger.error)
    } catch (error) {
        logger.error(error)
        await ctx.reply('❌ Export failed: ' + String(error))
    }
}))

// Import database from JSON file (reply to a .json file with this command)
admin.command('dbimport', Composer.acl(Number(adminID), async ctx => {
    try {
        // Check if replying to a document
        if (!ctx.message.reply_to_message || !('document' in ctx.message.reply_to_message)) {
            await ctx.reply('⚠️ Please reply to a JSON export file with /dbimport')
            return
        }

        const document = ctx.message.reply_to_message.document
        if (!document.file_name?.endsWith('.json')) {
            await ctx.reply('⚠️ Please reply to a .json file')
            return
        }

        await ctx.reply('📥 Downloading and parsing export file...')

        // Download the file
        const { href } = await ctx.telegram.getFileLink(document.file_id)
        const { data: exportData } = await axios.get(href)

        // Validate export structure
        if (!exportData.version || !exportData.data || !exportData.counts) {
            await ctx.reply('❌ Invalid export file format')
            return
        }

        await ctx.reply(`📊 Found data to import:
• Users: ${exportData.counts.users}
• Animes: ${exportData.counts.animes}
• Novels: ${exportData.counts.novels}
• Jobs: ${exportData.counts.jobs}
• Notification Groups: ${exportData.counts.notificationGroups}
• Notification History: ${exportData.counts.notificationHistory}

⏳ Starting import... This may take a while.`)

        // Helper to safely delete from a table using raw SQL
        const safeDeleteAll = async (table: string): Promise<void> => {
            try {
                await prisma.$executeRawUnsafe(`DELETE FROM ${table}`)
                logger.info(`Cleared table ${table}`)
            } catch (error) {
                logger.warn(`Table ${table} not found or error clearing: ${error}`)
            }
        }

        // Helper to safely insert using raw SQL
        const safeInsert = async (table: string, columns: string[], values: unknown[]): Promise<void> => {
            try {
                const placeholders = columns.map(() => '?').join(', ')
                const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
                await prisma.$executeRawUnsafe(sql, ...values)
            } catch (error) {
                logger.warn(`Failed to insert into ${table}: ${error}`)
            }
        }

        // Clear existing data (in correct order due to foreign keys)
        logger.info('Clearing existing data...')
        await safeDeleteAll('NotificationHistory')
        await safeDeleteAll('Anime')
        await safeDeleteAll('Novel')
        await safeDeleteAll('Job')
        await safeDeleteAll('_NotificationGroupToUser')
        await safeDeleteAll('NotificationGroup')
        await safeDeleteAll('User')

        // Import Users first
        logger.info('Importing users...')
        for (const user of exportData.data.users) {
            await safeInsert('User', ['id'], [user.id])
        }

        // Import Animes
        logger.info('Importing animes...')
        for (const anime of exportData.data.animes) {
            await safeInsert('Anime',
                ['name', 'anilistId', 'season', 'episode', 'onAir', 'note', 'userId'],
                [anime.name, anime.anilistId, anime.season, anime.episode, anime.onAir ? 1 : 0, anime.note, anime.userId]
            )
        }

        // Import Novels
        logger.info('Importing novels...')
        for (const novel of exportData.data.novels) {
            await safeInsert('Novel',
                ['name', 'anilistId', 'volume', 'chapter', 'part', 'releasing', 'note', 'userId'],
                [novel.name, novel.anilistId, novel.volume, novel.chapter, novel.part, novel.releasing ? 1 : 0, novel.note, novel.userId]
            )
        }

        // Import Jobs
        logger.info('Importing jobs...')
        for (const job of exportData.data.jobs) {
            await safeInsert('Job', ['id', 'date', 'text'], [job.id, job.date, job.text])
        }

        // Import NotificationGroups
        logger.info('Importing notification groups...')
        for (const ng of exportData.data.notificationGroups) {
            await safeInsert('NotificationGroup',
                ['groupId', 'createdAt', 'updatedAt'],
                [ng.groupId, ng.createdAt || new Date().toISOString(), ng.updatedAt || new Date().toISOString()]
            )

            // Get the ID of the just-inserted notification group
            const inserted = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
                `SELECT id FROM NotificationGroup WHERE groupId = ?`, ng.groupId
            ).catch(() => [])

            if (inserted.length > 0 && ng.userIds) {
                // Insert into junction table
                for (const userId of ng.userIds) {
                    await safeInsert('_NotificationGroupToUser', ['A', 'B'], [userId, inserted[0].id])
                }
            }
        }

        // Import NotificationHistory
        logger.info('Importing notification history...')
        for (const nh of exportData.data.notificationHistory) {
            await safeInsert('NotificationHistory',
                ['userId', 'animeId', 'createdAt'],
                [nh.userId, nh.animeId, nh.createdAt || new Date().toISOString()]
            )
        }

        // Verify counts using raw SQL
        const count = async (table: string): Promise<number> => {
            try {
                const result = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*) as count FROM ${table}`)
                return Number(result[0]?.count ?? 0)
            } catch {
                return 0
            }
        }

        const userCount = await count('User')
        const animeCount = await count('Anime')
        const novelCount = await count('Novel')
        const jobCount = await count('Job')
        const ngCount = await count('NotificationGroup')
        const nhCount = await count('NotificationHistory')

        await ctx.reply(`✅ Import completed!

📊 Verification:
• Users: ${userCount} (expected: ${exportData.counts.users})
• Animes: ${animeCount} (expected: ${exportData.counts.animes})
• Novels: ${novelCount} (expected: ${exportData.counts.novels})
• Jobs: ${jobCount} (expected: ${exportData.counts.jobs})
• Notification Groups: ${ngCount} (expected: ${exportData.counts.notificationGroups})
• Notification History: ${nhCount} (expected: ${exportData.counts.notificationHistory})`)

    } catch (error) {
        logger.error(error)
        await ctx.reply('❌ Import failed. Check logs for details.\n\n' + String(error))
    }
}))

export default admin
