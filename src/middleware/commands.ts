import { Composer, Markup } from "telegraf"
import axios from "axios"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"

import { padTo2Digits } from "../utils/index.js"

const commands = new Composer()

commands.start(ctx => {
    ctx.replyWithHTML(
        `Welcome!\n\nI can help you to look for anime and other stuff\nType /help to see what I can do`
    )
})

commands.help(ctx => {
    ctx.replyWithHTML(
        `Hi, ${ctx.from.first_name}!\nType <code>/save numberOfSeason numberOfEpisode nameOfAnime</code> to store anime in the database so you can remember where you left it <i>(very useful if you see a lot of anime)</i>.\n\nYou can also add a note using a new line.\nExample:\n<pre>/save 1 13 Spy X Family\nWatching with my gf</pre>\n\nThen using <code>/myanime</code> you can see the full list of anime you stored\n\nThere are other commands to search in Anilist:\n/anime &lt;name of anime> - look for anime\n/animebd - returns a list of characters whose birthday is today\n/character &lt;name of character> - look for character`
    )
})

commands.command(['myanime', 'myanimes'], async (ctx) => {
    const animes = await prisma.anime.findMany({
        where: {
            userId: ctx.from.id.toString()
        },
        take: 11,
        orderBy: {
            id: 'desc'
        }
    })

    if (animes.length > 0) {
        const animelist = animes.slice(0, 10).map(anime => `<i>${anime.name}</i> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

        const text = `<b>Anime stored for you:</b>\n\n${animelist}`

        const buttons = animes.slice(0, 10).map(anime => [Markup.button.callback(`"${anime.name}"`, `animeInfo_${anime.id}_${ctx.from.id.toString()}`)])

        buttons.push([
            Markup.button.callback('⏭', `myanime_2_${ctx.from.id.toString()}`, animes.length < 11)
        ])

        buttons.push([
            Markup.button.callback('💾 Export .txt 💾', `txt_${ctx.from.id.toString()}`),
        ])

        const keyboard = Markup.inlineKeyboard(buttons)

        ctx.replyWithHTML(text, keyboard)
    }
    else {
        ctx.replyWithHTML('<i>No anime found on DB</i>\n\nAdd some!')
    }
})

commands.command(['onair', 'airing', 't'], async (ctx) => {
    const animes = await prisma.anime.findMany({
        where: {
            userId: ctx.from.id.toString(),
            onAir: true
        },
        take: 11,
        orderBy: {
            id: 'desc'
        }
    })

    if (animes.length > 0) {
        const animelist = animes.slice(0, 10).map(anime => `<i>${anime.name}</i> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

        const text = `<b>Anime marked as 'On Air' stored for you:</b>\n\n${animelist}`

        const buttons = animes.slice(0, 10).map(anime => [Markup.button.callback(`"${anime.name}"`, `animeInfo_${anime.id}_${ctx.from.id.toString()}_airing`)])

        buttons.push([
            Markup.button.callback('⏭', `airing_2_${ctx.from.id.toString()}`, animes.length < 11)
        ])

        const keyboard = Markup.inlineKeyboard(buttons)

        ctx.replyWithHTML(text, keyboard)
    }
    else {
        ctx.replyWithHTML('<i>No anime marked as "On Air" found on DB</i>\n\nAdd some!')
    }
})

commands.command('save', async ctx => {
    const regex = /^\/save (\d+) (\d+) (.+)([\r\n\u0085\u2028\u2029]+(.+)?)?/i
    if (regex.test(ctx.message.text)) {
        try {
            const matches = ctx.message.text.match(regex)
            if (matches) {
                const season = matches[1]
                const episode = matches[2]
                const name = matches[3]
                const note = ctx.message.text.replace(/^\/save (\d+) (\d+) (.+)([\r\n\u0085\u2028\u2029]+)?/i, '')

                await prisma.anime
                    .upsert({
                        where: {
                            name_userId: {
                                name: name.trim(),
                                userId: ctx.from.id.toString()
                            }
                        },
                        create: {
                            name: name.trim(),
                            season: parseInt(season),
                            episode: parseInt(episode),
                            note,
                            user: {
                                connectOrCreate: {
                                    where: {
                                        id: ctx.from.id.toString(),
                                    },
                                    create: {
                                        id: ctx.from.id.toString(),
                                    }
                                }
                            }
                        },
                        update: {
                            season: parseInt(season),
                            episode: parseInt(episode),
                            note,
                        }
                    })
                    .then(() => ctx.reply('Done'))
                    .catch((e) => {
                        logger.error(e)
                        ctx.reply('Error creating/updating that record')
                    })
            }

        } catch (error) {
            logger.error(error)
        }
    }
})

commands.command('import', async ctx => {
    if (
        ctx.message.reply_to_message
        && 'document' in ctx.message.reply_to_message
        && ctx.message.reply_to_message.document.mime_type === 'text/plain'
    ) {
        try {
            const fileId = ctx.message.reply_to_message.document.file_id
            const { href } = await ctx.telegram.getFileLink(fileId)
            const { data } = await axios(href)
            const linesArray: string = data.split('\n')
            const regex = /.+ (\[)?S\d{2,}E\d{2,}(\])?(.+)?/i
            let recordsCount = 0
            for (const line of linesArray) {
                if (!regex.test(line))
                    return

                const parts = line.split(/(\[)?S\d{2,}E\d{2,}(\])?/)
                const name = parts[0].trim()
                const note = parts.pop()?.trim() ?? ''
                const season = parseInt(line.match(/S(\d+)/i)?.[1] ?? '1')
                const episode = parseInt(line.match(/E(\d+)/i)?.[1] ?? '1')

                recordsCount++
                await prisma.anime
                    .upsert({
                        where: {
                            name_userId: {
                                name: name,
                                userId: ctx.from.id.toString()
                            }
                        },
                        create: {
                            name: name,
                            season: season,
                            episode: episode,
                            note,
                            user: {
                                connectOrCreate: {
                                    where: {
                                        id: ctx.from.id.toString(),
                                    },
                                    create: {
                                        id: ctx.from.id.toString(),
                                    }
                                }
                            }
                        },
                        update: {
                            season: season,
                            episode: episode,
                            note,
                        }
                    })
                    .then(() => logger.success(`${name} was read`))
                    .catch((e) => {
                        logger.error(e)
                        ctx.reply('Error creating/updating that record')
                    })
            }
            ctx.replyWithHTML(`${recordsCount} records were created, updated or ignored`)
        } catch (error) {
            logger.error('Failed to import anime list')
            logger.error(error)
        }

    }
})

export default commands