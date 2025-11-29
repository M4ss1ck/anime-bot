import { Composer, Markup } from "telegraf"
import axios from "axios"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"
import type { Anime } from "../generated/prisma/client.js"

import { padTo2Digits, escape } from "../utils/index.js"

const commands = new Composer()

commands.start(async ctx => {
    return ctx.replyWithHTML(
        `Welcome!\n\nI can help you to look for anime and other stuff\nType /help to see what I can do`
    )
})

commands.help(async ctx => {
    return ctx.replyWithHTML(
        `Hi, ${ctx.from.first_name}!\n\n` +
        `<b>📺 Anime Management</b>\n` +
        `<code>/save &lt;season&gt; &lt;episode&gt; &lt;name&gt;</code> - Save anime progress\n` +
        `<i>(season and episode must be numbers)</i>\n` +
        `You can add a note on a new line. Example:\n` +
        `<pre>/save 1 13 Spy X Family\nWatching with my gf</pre>\n` +
        `<code>/myanime</code> - List your saved anime\n` +
        `<code>/onair</code> - List your saved anime that are currently airing\n` +
        `<code>/import</code> - Import anime list (reply to a .txt file)\n\n` +
        `<b>📖 Novel Management</b>\n` +
        `<code>/nsave &lt;part/vol/ch&gt; &lt;name&gt;</code> - Save novel progress\n` +
        `<i>(part/vol/ch must be a number)</i>\n` +
        `<code>/mynovels</code> - List your saved novels\n` +
        `<code>/releasing</code> - List your saved novels that are releasing\n\n` +
        `<b>🔍 Search</b>\n` +
        `<code>/anime &lt;name&gt;</code> - Search for anime\n` +
        `<code>/novel &lt;name&gt;</code> - Search for novels\n` +
        `<code>/character &lt;name&gt;</code> - Search for characters\n` +
        `<code>/animebd</code> - Characters with birthdays today\n\n` +
        `<b>🔔 Notifications</b>\n` +
        `<code>/check</code> - Check for new seasons/volumes manually\n` +
        `<code>/notify</code> - Activate daily summaries in this group\n` +
        `<code>/opt_in</code> - Opt-in for daily summaries\n` +
        `<code>/notify_on &lt;day&gt;</code> - Preview summary for a specific day`
    )
})

commands.command(['myanime', 'myanimes'], async (ctx) => {
    try {
        const query = ctx.message.text.replace(/^\/myanime(s)?((@\w+)?\s+)?/i, "")
        let animes: Anime[] = []
        if (query.length > 0) {
            animes = await prisma.anime.findMany({
                where: {
                    userId: ctx.from.id.toString(),
                    name: {
                        contains: query
                    },
                },
                take: 30,
                orderBy: [
                    {
                        updatedAt: { sort: 'desc', nulls: 'last' },
                    }, {
                        id: 'desc'
                    }
                ]
            })
        } else {
            animes = await prisma.anime.findMany({
                where: {
                    userId: ctx.from.id.toString()
                },
                take: 11,
                orderBy: [
                    {
                        updatedAt: { sort: 'desc', nulls: 'last' },
                    }, {
                        id: 'desc'
                    }
                ]
            })
        }

        if (animes.length > 0) {
            const animelist = animes.slice(0, !query ? 10 : 30).map(anime => `<code>${anime.name}</code> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

            const text = `<b>Anime stored for you:</b>\n\n${animelist}`

            const buttons = animes.slice(0, !query ? 10 : 30).map(anime => [Markup.button.callback(`"${anime.name}"`, `animeInfo_${anime.id}_${ctx.from.id.toString()}`)])

            buttons.push([
                Markup.button.callback('⏭', `myanime_2_${ctx.from.id.toString()}`, animes.length < 11 || query.length > 0)
            ])

            buttons.push([
                Markup.button.callback('📋 Full List 📋', `myanime_1_${ctx.from.id.toString()}`, !query)
            ])

            buttons.push([
                Markup.button.callback('💾 Export .txt 💾', `txt_${ctx.from.id.toString()}`),
            ])

            const keyboard = Markup.inlineKeyboard(buttons)

            return ctx.replyWithHTML(escape(text), keyboard).catch(logger.error)
        }
        else {
            return ctx.replyWithHTML('<i>No anime found on DB</i>\n\nAdd some!')
        }
    } catch (error) {
        logger.error(error)
    }
})

commands.command(['onair', 'airing', 't'], async (ctx) => {
    const animes = await prisma.anime.findMany({
        where: {
            userId: ctx.from.id.toString(),
            onAir: true
        },
        take: 11,
        orderBy: [
            {
                updatedAt: { sort: 'desc', nulls: 'last' },
            }, {
                id: 'desc'
            }
        ]
    })

    if (animes.length > 0) {
        const animelist = animes.slice(0, 10).map(anime => `<code>${anime.name}</code> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

        const text = `<b>Anime marked as 'On Air' stored for you:</b>\n\n${animelist}`

        const buttons = animes.slice(0, 10).map(anime => [Markup.button.callback(`"${anime.name}"`, `animeInfo_${anime.id}_${ctx.from.id.toString()}_airing`)])

        buttons.push([
            Markup.button.callback('⏭', `airing_2_${ctx.from.id.toString()}`, animes.length < 11)
        ])

        const keyboard = Markup.inlineKeyboard(buttons)

        return ctx.replyWithHTML(escape(text), keyboard).catch(logger.error)
    }
    else {
        return ctx.replyWithHTML('<i>No anime marked as "On Air" found on DB</i>\n\nAdd some!')
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
            return ctx.replyWithHTML(`${recordsCount} records were created, updated or ignored`)
        } catch (error) {
            logger.error('Failed to import anime list')
            logger.error(error)
        }

    }
})

export default commands