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

// Export entire database to JSON file
admin.command('dbexport', Composer.acl(Number(adminID), async ctx => {
    try {
        await ctx.reply('📦 Exporting database...')

        // Fetch all data
        const users = await prisma.user.findMany({
            include: {
                notificationGroups: {
                    select: { groupId: true }
                }
            }
        })

        const animes = await prisma.anime.findMany()
        const novels = await prisma.novel.findMany()
        const jobs = await prisma.job.findMany()

        const notificationGroups = await prisma.notificationGroup.findMany({
            include: {
                users: {
                    select: { id: true }
                }
            }
        })

        const notificationHistory = await prisma.notificationHistory.findMany()

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
                    notificationGroupIds: u.notificationGroups.map(ng => ng.groupId)
                })),
                animes: animes.map(a => ({
                    id: a.id,
                    name: a.name,
                    anilistId: a.anilistId,
                    season: a.season,
                    episode: a.episode,
                    onAir: a.onAir,
                    note: a.note,
                    userId: a.userId,
                    updatedAt: a.updatedAt?.toISOString() ?? null,
                })),
                novels: novels.map(n => ({
                    id: n.id,
                    name: n.name,
                    anilistId: n.anilistId,
                    volume: n.volume,
                    chapter: n.chapter,
                    part: n.part,
                    releasing: n.releasing,
                    note: n.note,
                    userId: n.userId,
                    updatedAt: n.updatedAt?.toISOString() ?? null,
                })),
                jobs: jobs.map(j => ({
                    id: j.id,
                    date: j.date,
                    text: j.text,
                })),
                notificationGroups: notificationGroups.map(ng => ({
                    id: ng.id,
                    groupId: ng.groupId,
                    userIds: ng.users.map(u => u.id),
                    createdAt: ng.createdAt.toISOString(),
                    updatedAt: ng.updatedAt.toISOString(),
                })),
                notificationHistory: notificationHistory.map(nh => ({
                    id: nh.id,
                    userId: nh.userId,
                    animeId: nh.animeId,
                    createdAt: nh.createdAt.toISOString(),
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
        await ctx.reply('❌ Export failed. Check logs for details.')
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

        // Clear existing data (in correct order due to foreign keys)
        logger.info('Clearing existing data...')
        await prisma.notificationHistory.deleteMany()
        await prisma.anime.deleteMany()
        await prisma.novel.deleteMany()
        await prisma.job.deleteMany()
        await prisma.notificationGroup.deleteMany()
        await prisma.user.deleteMany()

        // Import Users first
        logger.info('Importing users...')
        for (const user of exportData.data.users) {
            await prisma.user.create({
                data: { id: user.id }
            })
        }

        // Import Animes
        logger.info('Importing animes...')
        for (const anime of exportData.data.animes) {
            await prisma.anime.create({
                data: {
                    name: anime.name,
                    anilistId: anime.anilistId,
                    season: anime.season,
                    episode: anime.episode,
                    onAir: anime.onAir,
                    note: anime.note,
                    userId: anime.userId,
                }
            })
        }

        // Import Novels
        logger.info('Importing novels...')
        for (const novel of exportData.data.novels) {
            await prisma.novel.create({
                data: {
                    name: novel.name,
                    anilistId: novel.anilistId,
                    volume: novel.volume,
                    chapter: novel.chapter,
                    part: novel.part,
                    releasing: novel.releasing,
                    note: novel.note,
                    userId: novel.userId,
                }
            })
        }

        // Import Jobs
        logger.info('Importing jobs...')
        for (const job of exportData.data.jobs) {
            await prisma.job.create({
                data: {
                    id: job.id,
                    date: job.date,
                    text: job.text,
                }
            })
        }

        // Import NotificationGroups with user connections
        logger.info('Importing notification groups...')
        for (const ng of exportData.data.notificationGroups) {
            await prisma.notificationGroup.create({
                data: {
                    groupId: ng.groupId,
                    users: {
                        connect: ng.userIds.map((id: string) => ({ id }))
                    }
                }
            })
        }

        // Import NotificationHistory
        logger.info('Importing notification history...')
        for (const nh of exportData.data.notificationHistory) {
            await prisma.notificationHistory.create({
                data: {
                    userId: nh.userId,
                    animeId: nh.animeId,
                }
            })
        }

        // Verify counts
        const userCount = await prisma.user.count()
        const animeCount = await prisma.anime.count()
        const novelCount = await prisma.novel.count()
        const jobCount = await prisma.job.count()
        const ngCount = await prisma.notificationGroup.count()
        const nhCount = await prisma.notificationHistory.count()

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
