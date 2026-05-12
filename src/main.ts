import { Telegraf } from 'telegraf'
import type { Update } from 'telegraf/types'
import { Elysia } from 'elysia'
import { logger } from './logger/index.js'
import anime from './middleware/anime.js'
import novel from './middleware/novels.js'
import commands from './middleware/commands.js'
import actions from './middleware/actions.js'
import inline from './middleware/inline.js'
import admin from './middleware/admin.js'
import exporter from './middleware/exporter.js'
import ping from './middleware/ping.js'
import broadcast from './middleware/broadcast.js'
import commandLogger from './middleware/commandLogger.js'
import { scheduler } from './middleware/scheduler.js'
import notify from './middleware/notify.js'
import check from './middleware/check.js'
import { runScheduled } from './utils/index.js'

const bot = new Telegraf(process.env.BOT_TOKEN ?? '')

bot
    .use(commandLogger)
    .use(admin)
    .use(exporter)
    .use(ping)
    .use(anime)
    .use(novel)
    .use(commands)
    .use(actions)
    .use(inline)
    .use(check)
    .use(broadcast)
    .use(scheduler)
    .use(notify)

bot.catch((err) => {
    logger.info('[bot.catch] ERROR')
    logger.error(err)
})

const commandList = await bot.telegram
    .getMyCommands()
    .catch((e) => logger.error(e));

const latestCommand = 'export'
if (commandList && !commandList.some((command) => command.command === latestCommand)) {
    bot.telegram.setMyCommands([
        {
            command: "myanime",
            description: "Show your stored anime."
        },
        {
            command: "save",
            description: "Add new anime to database.",
        },
        {
            command: "anime",
            description: "Search anime in AniList.",
        },
        {
            command: "character",
            description: "Search character in AniList.",
        },
        {
            command: "animebd",
            description: "Search for characters with a birthday today.",
        },
        {
            command: "help",
            description: "Get help."
        },
        {
            command: "myjobs",
            description: "Show your anime alerts."
        },
        {
            command: "onair",
            description: "Show the list with your stored anime that are currently airing."
        },
        {
            command: "import",
            description: "Import a list with your anime info."
        },
        {
            command: "mynovels",
            description: "Show your stored novels."
        },
        {
            command: "releasing",
            description: "Show the list with your stored novels that are not finished yet."
        },
        {
            command: "novel",
            description: "Search novel in AniList."
        },
        {
            command: "ping",
            description: "pong!"
        },
        {
            command: "notify",
            description: "Activate daily anime summaries in this group."
        },
        {
            command: "opt_in",
            description: "Opt-in to receive daily anime summaries in this group."
        },
        {
            command: "notify_on",
            description: "Preview anime summary for a specific day (e.g. /notify_on monday)."
        },
        {
            command: "check",
            description: "Check for new seasons/volumes manually."
        },
        {
            command: "nsave",
            description: "Save novel progress."
        },
        {
            command: "export",
            description: "Export your data (anime, novels, reminders) as a JSON file."
        }
    ])
        .then(() => logger.info("Command list updated."))
        .catch((e) => logger.error("Failed to update command list:", e));
} else {
    logger.info("Bot commands are up-to-date. No update needed.");
}

await runScheduled(bot)

const mode = process.env.BOT_MODE ?? (process.env.NODE_ENV === 'production' ? 'webhook' : 'polling')

if (mode === 'webhook') {
    const botToken = process.env.BOT_TOKEN
    const webhookDomain = process.env.WEBHOOK_DOMAIN
    const port = Number(process.env.PORT ?? '3000')

    if (!botToken) {
        logger.error('BOT_TOKEN is required for webhook mode')
        process.exit(1)
    }
    if (!webhookDomain) {
        logger.error('WEBHOOK_DOMAIN is required for webhook mode')
        process.exit(1)
    }

    const webhookPath = `/webhook/${botToken}`
    const webhookUrl = `${webhookDomain.replace(/\/$/, '')}${webhookPath}`

    await bot.telegram.setWebhook(webhookUrl).catch((e) => {
        logger.error('Failed to set webhook:', e)
        process.exit(1)
    })
    logger.info(`Webhook set to ${webhookUrl}`)

    const app = new Elysia()
        .get('/health', () => 'ok')
        .post(webhookPath, async ({ body, set }) => {
            try {
                await bot.handleUpdate(body as Update)
            } catch (err) {
                logger.error('Error handling update:', err)
            }
            set.status = 200
            return 'ok'
        })

    app.listen(port)

    logger.success(`BOT INICIADO (webhook mode on port ${port})`)

    const gracefulStop = (signal: string) => {
        logger.info(`Received ${signal}, stopping...`)
        bot.stop(signal)
        app.server?.stop()
        process.exit(0)
    }

    process.once('SIGINT', () => gracefulStop('SIGINT'))
    process.once('SIGTERM', () => gracefulStop('SIGTERM'))
} else {
    bot.launch({
        dropPendingUpdates: true,
    })
    logger.success('BOT INICIADO (polling mode)')

    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))
}
