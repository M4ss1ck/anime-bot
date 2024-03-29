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
import { scheduler } from './middleware/scheduler.js'
import { runScheduled } from './utils/index.js'

const bot = new Telegraf(process.env.BOT_TOKEN ?? '')

bot
    // .use(users)
    .use(admin)
    .use(ping)
    .use(anime)
    .use(novel)
    .use(commands)
    .use(actions)
    .use(inline)
    .use(broadcast)
    .use(scheduler)

const commandList = await bot.telegram
    .getMyCommands()
    .catch((e) => logger.error(e));

const latestCommand = 'ping'
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
        }
    ]);
} else {
    logger.info("No need to update commands");
}

// Iniciar bot
bot.launch()
logger.success('BOT INICIADO')

bot.catch((err) => {
    logger.info('[bot.catch] ERROR')
    logger.error(err)
})

await runScheduled(bot)

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))