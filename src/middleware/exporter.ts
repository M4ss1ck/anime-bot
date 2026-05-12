import { Composer, InputFile } from "grammy"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import * as fs from 'fs/promises'

const exporter = new Composer()

exporter.command('export', async ctx => {
    const userId = String(ctx.from?.id ?? '')
    if (!userId) {
        await ctx.reply('⚠️ Could not determine your user id.')
        return
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                animes: true,
                novels: true,
                notificationGroups: { select: { groupId: true } },
            },
        })

        if (!user) {
            await ctx.reply('You have no data stored yet. Save an anime or novel first.')
            return
        }

        // Jobs are global (no userId column); the convention encodes the user id
        // as the trailing `:<userId>` segment of the job id (see src/utils/index.ts).
        const allJobs = await prisma.job.findMany()
        const jobs = allJobs.filter(j => j.id.endsWith(`:${userId}`))

        const notificationHistory = await prisma.notificationHistory.findMany({
            where: { userId },
        })

        const exportData = {
            exportedAt: new Date().toISOString(),
            version: '1.0.0',
            scope: 'user',
            user: { id: user.id },
            counts: {
                animes: user.animes.length,
                novels: user.novels.length,
                jobs: jobs.length,
                notificationGroups: user.notificationGroups.length,
                notificationHistory: notificationHistory.length,
            },
            data: {
                animes: user.animes,
                novels: user.novels,
                jobs,
                notificationGroups: user.notificationGroups.map(g => g.groupId),
                notificationHistory,
            },
        }

        const fileName = `anime-bot-export-${userId}-${Date.now()}.json`
        await fs.writeFile(fileName, JSON.stringify(exportData, null, 2))

        const summary = `📊 Your data:
• Animes: ${exportData.counts.animes}
• Novels: ${exportData.counts.novels}
• Reminders: ${exportData.counts.jobs}
• Notification groups: ${exportData.counts.notificationGroups}`

        await ctx.replyWithDocument(
            new InputFile(fileName, fileName),
            { caption: `✅ Export ready.\n\n${summary}` }
        )

        await fs.unlink(fileName).catch(logger.error)
    } catch (error) {
        logger.error(error)
        await ctx.reply('❌ Export failed: ' + String(error))
    }
})

export default exporter
