import { Telegraf } from 'telegraf'
import { logger } from './logger/index.js'
import anime from './middleware/anime.js'
import novel from './middleware/novels.js'
import commands from './middleware/commands.js'
// import users from './middleware/createUsers.js'
import actions from './middleware/actions.js'
import inline from './middleware/inline.js'
import admin from './middleware/admin.js'
import ping from './middleware/ping.js'
import broadcast from './middleware/broadcast.js'
import commandLogger from './middleware/commandLogger.js'
import { scheduler } from './middleware/scheduler.js'
import notify from './middleware/notify.js'
import check from './middleware/check.js'
import { runScheduled } from './utils/index.js'

const bot = new Telegraf(process.env.BOT_TOKEN ?? '')

bot
    // .use(users)
    .use(commandLogger)
    .use(admin)
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

const commandList = await bot.telegram
    .getMyCommands()
    .catch((e) => logger.error(e));

const latestCommand = 'notify_on'
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
        }
    ])
        .then(() => logger.info("Command list updated."))
        .catch((e) => logger.error("Failed to update command list:", e));
} else {
    logger.info("Bot commands are up-to-date. No update needed.");
}

// Iniciar bot
bot.launch({
    dropPendingUpdates: true,
})
logger.success('BOT INICIADO')

bot.catch((err) => {
    logger.info('[bot.catch] ERROR')
    logger.error(err)
})

await runScheduled(bot)

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))