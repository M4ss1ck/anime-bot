import { Composer, Markup } from "telegraf"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"

import * as fs from 'fs/promises'

import { padTo2Digits } from "../utils/index.js"
import { getAnime } from "../anilist-service/index.js"

const actions = new Composer()

actions.action(/animeInfo_\d+_\d+(_\w+)?/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [animeId, userId, onlyAiring] = ctx.callbackQuery.data.replace(/animeInfo_/i, '').split('_')

        if (animeId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your list').catch(e => logger.error(e))
                return
            }

            await ctx.answerCbQuery().catch(e => logger.error(e))

            const anime = await prisma.anime.findUnique({
                where: {
                    id: parseInt(animeId)
                }
            })

            if (anime) {
                const buttons = []

                buttons.push([
                    Markup.button.callback('Season', `seasonAlert`),
                    Markup.button.callback('➖', `seasonMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    Markup.button.callback('➕', `seasonPlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback('Episode', `episodeAlert`),
                    Markup.button.callback('➖', `episodeMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    Markup.button.callback('➕', `episodePlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback(`On Air: ${anime && anime.onAir ? '✅' : '❌'}`, `toggleOnAir_${animeId}_${userId}_${anime && anime.onAir ? 'off' : 'on'}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback(`🗑 DELETE 🗑`, `deleteAnime_${animeId}_${userId}`, !!ctx.callbackQuery.inline_message_id)
                ])
                if (onlyAiring) {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `airing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `myanime_1_${userId}`)
                    ])
                }

                const keyboard = Markup.inlineKeyboard(buttons)

                const text = anime ? `<b>Name:</b> ${anime.name}\n<b>Season:</b> ${anime.season}\n<b>Episode:</b> ${anime.episode}\n\n<b>Note:</b>\n${anime.note && anime.note.length > 0 ? anime.note : '-'}\n\n<i>To edit, use the buttons or modify the following code:</i>\n<pre>/save ${anime.season} ${anime.episode} ${anime.name}\n${anime.note}</pre>` : '<b>Anime not found for this id</b>'

                ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
            }
        }
    }
})

actions.action(/(season|episode)(Minus|Plus)_\d+_\d+(_\w+)?/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [animeId, userId, onlyAiring] = ctx.callbackQuery.data.replace(/(season|episode)(Minus|Plus)_/i, '').split('_')
        const isSeason = /season(Minus|Plus)_/i.test(ctx.callbackQuery.data ?? '')
        const isMinus = /(season|episode)Minus_/i.test(ctx.callbackQuery.data ?? '')
        if (animeId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            await ctx.answerCbQuery().catch(e => logger.error(e))

            const seasonIncrement = !isSeason ? 0 : !isMinus ? 1 : -1
            const episodeIncrement = isSeason ? 0 : !isMinus ? 1 : -1
            await prisma.anime.update({
                where: {
                    id: parseInt(animeId)
                },
                data: {
                    season: {
                        increment: seasonIncrement
                    },
                    episode: {
                        increment: episodeIncrement
                    }
                }
            }).then((anime) => {
                const buttons = []

                buttons.push([
                    Markup.button.callback('Season', `seasonAlert`),
                    Markup.button.callback('➖', `seasonMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    Markup.button.callback('➕', `seasonPlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback('Episode', `episodeAlert`),
                    Markup.button.callback('➖', `episodeMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    Markup.button.callback('➕', `episodePlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback(`On Air: ${anime.onAir ? '✅' : '❌'}`, `toggleOnAir_${animeId}_${userId}_${anime.onAir ? 'off' : 'on'}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback(`🗑 DELETE 🗑`, `deleteAnime_${animeId}_${userId}`, !!ctx.callbackQuery.inline_message_id)
                ])
                if (onlyAiring) {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `airing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `myanime_1_${userId}`)
                    ])
                }

                const keyboard = Markup.inlineKeyboard(buttons)

                const text = anime ? `<b>Name:</b> ${anime.name}\n<b>Season:</b> ${anime.season}\n<b>Episode:</b> ${anime.episode}\n\n<b>Note:</b>\n${anime.note && anime.note.length > 0 ? anime.note : '-'}\n\n<i>To edit, use the buttons or modify the following code:</i>\n<pre>/save ${anime.season} ${anime.episode} ${anime.name}\n${anime.note}</pre>` : '<b>Anime not found for this id</b>'

                ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
            }).catch(logger.error)
        }
    }

})

actions.action(/(season|episode)Alert/i, ctx => {
    const type = /season/i.test('data' in ctx.callbackQuery ? ctx.callbackQuery.data : '') ? 'season' : 'episode'
    ctx
        .answerCbQuery(`Use the ➖ and ➕ buttons to modify ${type}`, { show_alert: true })
        .catch(e => logger.error(e))
})

actions.action(/toggleOnAir_\d+_\d+_(on|off)(_\w+)?/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [animeId, userId, value, onlyAiring] = ctx.callbackQuery.data.replace(/toggleOnAir_/i, '').split('_')
        if (animeId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            await ctx.answerCbQuery().catch(e => logger.error(e))

            await prisma.anime.update({
                where: {
                    id: parseInt(animeId)
                },
                data: {
                    onAir: value === 'on'
                }
            }).then(anime => {
                const buttons = []

                buttons.push([
                    Markup.button.callback('Season', `seasonAlert`),
                    Markup.button.callback('➖', `seasonMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    Markup.button.callback('➕', `seasonPlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback('Episode', `episodeAlert`),
                    Markup.button.callback('➖', `episodeMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    Markup.button.callback('➕', `episodePlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback(`On Air: ${anime.onAir ? '✅' : '❌'}`, `toggleOnAir_${animeId}_${userId}_${anime.onAir ? 'off' : 'on'}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback(`🗑 DELETE 🗑`, `deleteAnime_${animeId}_${userId}`, !!ctx.callbackQuery.inline_message_id)
                ])
                if (onlyAiring) {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `airing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `myanime_1_${userId}`)
                    ])
                }

                const keyboard = Markup.inlineKeyboard(buttons)

                const text = anime ? `<b>Name:</b> ${anime.name}\n<b>Season:</b> ${anime.season}\n<b>Episode:</b> ${anime.episode}\n\n<b>Note:</b>\n${anime.note && anime.note.length > 0 ? anime.note : '-'}\n\n<i>To edit, use the buttons or modify the following code:</i>\n<pre>/save ${anime.season} ${anime.episode} ${anime.name}\n${anime.note}</pre>` : '<b>Anime not found for this id</b>'

                ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
            }).catch(logger.error)
        }
    }

})

actions.action(/txt_\d+/, async ctx => {
    await ctx.answerCbQuery().catch(e => logger.error(e))
    const userId = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace(/txt_/i, '') : '123'
    const fileName = `${userId}.txt`

    if (userId !== ctx.callbackQuery.from.id.toString()) {
        ctx.answerCbQuery('This is not your list').catch(e => logger.error(e))
    }
    else {
        const animes = await prisma.anime.findMany({
            where: {
                userId: userId
            }
        })

        const animelist = animes.map(anime => `${anime.name} [S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}] ${anime.note ?? ''}`).join('\n')

        await fs.writeFile(fileName, animelist)

        await ctx.replyWithDocument({ source: fileName, filename: `anime_${Date.now()}.txt` }, { caption: 'Your list of anime' })

        await fs.unlink(fileName)
    }
})

actions.action(/myanime_\d+_\d+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [page, userId] = ctx.callbackQuery.data.replace(/myanime_/i, '').split('_')
        if (page && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                ctx.answerCbQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            const skip = (parseInt(page) - 1) * 10

            const animes = await prisma.anime.findMany({
                where: {
                    userId: userId
                },
                take: 11,
                skip: skip,
                orderBy: {
                    id: 'desc'
                }
            })

            const animelist = animes.slice(0, 10).map(anime => `<i>${anime.name}</i> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

            const text = `<b>Anime stored for you:</b>\n\n${animelist}`

            const buttons = animes.slice(0, 10).map(anime => [Markup.button.callback(`"${anime.name}"`, `animeInfo_${anime.id}_${userId}`)])

            buttons.push([
                Markup.button.callback('⏮', `myanime_${parseInt(page) - 1}_${userId}`, parseInt(page) < 2),
                Markup.button.callback('⏭', `myanime_${parseInt(page) + 1}_${userId}`, animes.length < 11)
            ])

            buttons.push([
                Markup.button.callback('💾 Export .txt 💾', `txt_${userId}`, !!ctx.callbackQuery.inline_message_id),
            ])

            const keyboard = Markup.inlineKeyboard(buttons)

            ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
        }
    }
})

actions.action(/airing_\d+_\d+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [page, userId] = ctx.callbackQuery.data.replace(/airing_/i, '').split('_')
        if (page && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                ctx.answerCbQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            const skip = (parseInt(page) - 1) * 10

            const animes = await prisma.anime.findMany({
                where: {
                    userId: userId,
                    onAir: true
                },
                take: 11,
                skip: skip,
                orderBy: {
                    id: 'desc'
                }
            })

            const animelist = animes.slice(0, 10).map(anime => `<i>${anime.name}</i> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

            const text = `<b>Anime marked as 'On Air' stored for you:</b>\n\n${animelist}`

            const buttons = animes.slice(0, 10).map(anime => [Markup.button.callback(`"${anime.name}"`, `animeInfo_${anime.id}_${userId}_airing`)])

            buttons.push([
                Markup.button.callback('⏮', `airing_${parseInt(page) - 1}_${userId}`, parseInt(page) < 2),
                Markup.button.callback('⏭', `airing_${parseInt(page) + 1}_${userId}`, animes.length < 11)
            ])

            const keyboard = Markup.inlineKeyboard(buttons)

            ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
        }
    }
})

actions.action(/Local_\d+_\d+_.+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [page, userId, query] = ctx.callbackQuery.data.replace(/Local_/i, '').split('_')
        if (page && userId && query) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                ctx.answerCbQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            const skip = (parseInt(page) - 1) * 10

            const animes = await prisma.anime.findMany({
                where: {
                    userId: userId,
                    name: {
                        contains: query
                    },
                },
                take: 11,
                skip: skip,
                orderBy: {
                    id: 'desc'
                }
            })

            const animelist = animes.map(anime => `<i>${anime.name}</i> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

            const text = `<b>Anime stored for you:</b>\n\n${animelist}`

            const buttons = animes.map(anime => [Markup.button.callback(`"${anime.name}"`, `animeInfo_${anime.id}_${userId}`)])

            buttons.push([
                Markup.button.callback('⏮', `myanime_${parseInt(page) - 1}_${userId}`, parseInt(page) < 2),
                Markup.button.callback('⏭', `myanime_${parseInt(page) + 1}_${userId}`, animes.length < 11)
            ])

            buttons.push([
                Markup.button.callback('💾 Export .txt 💾', `txt_${userId}`, !!ctx.callbackQuery.inline_message_id),
            ])

            const keyboard = Markup.inlineKeyboard(buttons)

            ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
        }
    }
})

// afm = add from menu
actions.action(/afm_\d+_\d+_\d+_\d+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [season, episode, user, animeId] = ctx.callbackQuery.data.replace(/afm_/i, '').split('_')
        try {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== user) {
                ctx.answerCbQuery('This is not your menu').catch(e => logger.error(e))
                return
            }

            const results = await getAnime(parseInt(animeId))
            const anime = results.Media
            const englishTitle = anime.title.english ?? 'English title not found!'
            await prisma.anime
                .upsert({
                    where: {
                        name_userId: {
                            name: anime.title.romaji.trim(),
                            userId: user
                        }
                    },
                    create: {
                        name: anime.title.romaji.trim(),
                        season: parseInt(season),
                        episode: parseInt(episode),
                        note: englishTitle + '\nAdded from the menu',
                        onAir: anime.nextAiringEpisode?.airingAt ? true : false,
                        user: {
                            connectOrCreate: {
                                where: {
                                    id: user,
                                },
                                create: {
                                    id: user,
                                }
                            }
                        }
                    },
                    update: {
                        note: englishTitle + '\nUpdated from the menu',
                    }
                })
                .then(() => ctx.answerCbQuery('Anime added/updated!').catch(logger.error))
                .catch(logger.error)

        } catch (error) {
            logger.error(error)
        }
    }
})

actions.action(/deleteAnime_/, async ctx => {
    try {
        if ('data' in ctx.callbackQuery && !ctx.callbackQuery.inline_message_id) {
            const [animeId, userId] = ctx.callbackQuery.data.replace(/deleteAnime_/i, '').split('_')
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                ctx.answerCbQuery('This is not your menu').catch(e => logger.error(e))
                return
            }
            await prisma.anime.delete({
                where: {
                    id: parseInt(animeId)
                }
            }).then(() => {
                ctx.answerCbQuery('Anime deleted!').catch(logger.error)
                ctx.replyWithHTML('Your anime record was deleted.\nIf you made a mistake, just send the <code>monospaced text</code> in the previous message.')
            }).catch(() => ctx.answerCbQuery().catch(logger.error))
        }
    } catch (error) {
        logger.error(error)
    }
})

export default actions