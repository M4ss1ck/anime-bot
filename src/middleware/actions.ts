import { Composer, InlineKeyboard, InputFile } from "grammy"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"

import * as fs from 'fs/promises'

import { padTo2Digits, escapeHtml } from "../utils/index.js"
import { getAnime } from "../anilist-service/index.js"
import { getBestDetails, getDetailsByProvider, searchDetails, summarizeDetails, toAnimeUpdate } from "../details-service/index.js"

const actions = new Composer()

const btn = (text: string, callback_data: string) => ({ text, callback_data })

actions.callbackQuery(/animeInfo_\d+_\d+(_\w+)?/i, async (ctx) => {
    if ('data' in ctx.callbackQuery) {
        const [animeId, userId, onlyAiring] = ctx.callbackQuery.data.replace(/animeInfo_/i, '').split('_')

        if (animeId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your list').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            const anime = await prisma.anime.findUnique({
                where: {
                    id: parseInt(animeId)
                }
            })

            if (anime) {
                const buttons: { text: string; callback_data: string }[][] = []

                buttons.push([
                    btn('Season', `seasonAlert`),
                    btn('➖', `seasonMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    btn('➕', `seasonPlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    btn('Episode', `episodeAlert`),
                    btn('➖', `episodeMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    btn('➕', `episodePlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    btn(`On Air: ${anime && anime.onAir ? '✅' : '❌'}`, `toggleOnAir_${animeId}_${userId}_${anime && anime.onAir ? 'off' : 'on'}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    btn('Fetch details', `adf_${animeId}_${userId}`)
                ])
                buttons.push([
                    btn(`🗑 DELETE 🗑`, `deleteAnime_${animeId}_${userId}`)
                ])
                if (onlyAiring) {
                    buttons.push([
                        btn('🔙 Full list', `airing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        btn('🔙 Full list', `myanime_1_${userId}`)
                    ])
                }

                const keyboard = InlineKeyboard.from(buttons)

                const text = anime ? `<b>Name:</b> ${escapeHtml(anime.name)}\n<b>Season:</b> ${anime.season}\n<b>Episode:</b> ${anime.episode}\n\n<b>Note:</b>\n${anime.note && anime.note.length > 0 ? escapeHtml(anime.note) : '-'}\n\n<i>To edit, use the buttons or modify the following code:</i>\n<pre>/save ${anime.season} ${anime.episode} ${escapeHtml(anime.name)}\n${escapeHtml(anime.note || '')}</pre>` : '<b>Anime not found for this id</b>'

                return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
            }
        }
    }
})

actions.callbackQuery(/(season|episode)(Minus|Plus)_\d+_\d+(_\w+)?/i, async (ctx) => {
    if ('data' in ctx.callbackQuery) {
        const [animeId, userId, onlyAiring] = ctx.callbackQuery.data.replace(/(season|episode)(Minus|Plus)_/i, '').split('_')
        const isSeason = /season(Minus|Plus)_/i.test(ctx.callbackQuery.data ?? '')
        const isMinus = /(season|episode)Minus_/i.test(ctx.callbackQuery.data ?? '')
        if (animeId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

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
                    episode: isSeason ? 1 : {
                        increment: episodeIncrement
                    }
                }
            }).then(async (anime) => {
                const buttons: { text: string; callback_data: string }[][] = []

                buttons.push([
                    btn('Season', `seasonAlert`),
                    btn('➖', `seasonMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    btn('➕', `seasonPlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    btn('Episode', `episodeAlert`),
                    btn('➖', `episodeMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    btn('➕', `episodePlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    btn(`On Air: ${anime.onAir ? '✅' : '❌'}`, `toggleOnAir_${animeId}_${userId}_${anime.onAir ? 'off' : 'on'}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    btn('Fetch details', `adf_${animeId}_${userId}`)
                ])
                buttons.push([
                    btn(`🗑 DELETE 🗑`, `deleteAnime_${animeId}_${userId}`)
                ])
                if (onlyAiring) {
                    buttons.push([
                        btn('🔙 Full list', `airing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        btn('🔙 Full list', `myanime_1_${userId}`)
                    ])
                }

                const keyboard = InlineKeyboard.from(buttons)

                const text = anime ? `<b>Name:</b> ${escapeHtml(anime.name)}\n<b>Season:</b> ${anime.season}\n<b>Episode:</b> ${anime.episode}\n\n<b>Note:</b>\n${anime.note && anime.note.length > 0 ? escapeHtml(anime.note) : '-'}\n\n<i>To edit, use the buttons or modify the following code:</i>\n<pre>/save ${anime.season} ${anime.episode} ${escapeHtml(anime.name)}\n${escapeHtml(anime.note || '')}</pre>` : '<b>Anime not found for this id</b>'

                await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
            }).catch(logger.error)
        }
    }

})

actions.callbackQuery(/(season|episode)Alert/i, (ctx) => {
    const type = /season/i.test('data' in ctx.callbackQuery ? ctx.callbackQuery.data : '') ? 'season' : 'episode'
    ctx.api
        .answerCallbackQuery(ctx.callbackQuery.id, { text: `Use the ➖ and ➕ buttons to modify ${type}`, show_alert: true })
        .catch(e => logger.error(e))
})

actions.callbackQuery(/toggleOnAir_\d+_\d+_(on|off)(_\w+)?/i, async (ctx) => {
    if ('data' in ctx.callbackQuery) {
        const [animeId, userId, value, onlyAiring] = ctx.callbackQuery.data.replace(/toggleOnAir_/i, '').split('_')
        if (animeId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            await prisma.anime.update({
                where: {
                    id: parseInt(animeId)
                },
                data: {
                    onAir: value === 'on'
                }
            }).then(async (anime) => {
                const buttons: { text: string; callback_data: string }[][] = []

                buttons.push([
                    btn('Season', `seasonAlert`),
                    btn('➖', `seasonMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    btn('➕', `seasonPlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    btn('Episode', `episodeAlert`),
                    btn('➖', `episodeMinus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`),
                    btn('➕', `episodePlus_${animeId}_${userId}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    btn(`On Air: ${anime.onAir ? '✅' : '❌'}`, `toggleOnAir_${animeId}_${userId}_${anime.onAir ? 'off' : 'on'}${onlyAiring ? '_airing' : ''}`)
                ])
                buttons.push([
                    btn('Fetch details', `adf_${animeId}_${userId}`)
                ])
                buttons.push([
                    btn(`🗑 DELETE 🗑`, `deleteAnime_${animeId}_${userId}`)
                ])
                if (onlyAiring) {
                    buttons.push([
                        btn('🔙 Full list', `airing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        btn('🔙 Full list', `myanime_1_${userId}`)
                    ])
                }

                const keyboard = InlineKeyboard.from(buttons)

                const text = anime ? `<b>Name:</b> ${escapeHtml(anime.name)}\n<b>Season:</b> ${anime.season}\n<b>Episode:</b> ${anime.episode}\n\n<b>Note:</b>\n${anime.note && anime.note.length > 0 ? escapeHtml(anime.note) : '-'}\n\n<i>To edit, use the buttons or modify the following code:</i>\n<pre>/save ${anime.season} ${anime.episode} ${escapeHtml(anime.name)}\n${escapeHtml(anime.note || '')}</pre>` : '<b>Anime not found for this id</b>'

                await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
            }).catch(logger.error)
        }
    }

})

actions.callbackQuery(/txt_\d+/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(e => logger.error(e))
    const userId = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace(/txt_/i, '') : '123'
    const fileName = `${userId}.txt`

    if (userId !== ctx.callbackQuery.from.id.toString()) {
        await ctx.answerCallbackQuery('This is not your list').catch(e => logger.error(e))
    }
    else {
        const animes = await prisma.anime.findMany({
            where: {
                userId: userId
            },
            orderBy: {
                updatedAt: { sort: 'desc', nulls: 'last' },
                id: 'desc'
            }
        })

        const animelist = animes.map(anime => `${anime.name} [S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}] ${anime.note ?? ''}`).join('\n')

        await fs.writeFile(fileName, animelist)

        await ctx.replyWithDocument(new InputFile(fileName, `anime_${Date.now()}.txt`), { caption: 'Your list of anime' })

        await fs.unlink(fileName).catch(logger.error)
    }
})

actions.callbackQuery(/myanime_\d+_\d+/i, async (ctx) => {
    if ('data' in ctx.callbackQuery) {
        const [page, userId] = ctx.callbackQuery.data.replace(/myanime_/i, '').split('_')
        if (page && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            const skip = (parseInt(page) - 1) * 10

            const animes = await prisma.anime.findMany({
                where: {
                    userId: userId
                },
                take: 11,
                skip: skip,
                orderBy: [
                    {
                        updatedAt: { sort: 'desc', nulls: 'last' },
                    }, {
                        id: 'desc'
                    }
                ]
            })

            const animelist = animes.slice(0, 10).map(anime => `<code>${escapeHtml(anime.name)}</code> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

            const text = `<b>Anime stored for you:</b>\n\n${animelist}`

            const keyboard = new InlineKeyboard()
            for (const anime of animes.slice(0, 10)) {
                keyboard.text(`"${anime.name}"`, `animeInfo_${anime.id}_${userId}`).row()
            }
            if (parseInt(page) > 1)
                keyboard.text('⏮', `myanime_${parseInt(page) - 1}_${userId}`)
            if (animes.length > 10)
                keyboard.text('⏭', `myanime_${parseInt(page) + 1}_${userId}`)
            keyboard.row()
            keyboard.text('💾 Export .txt 💾', `txt_${userId}`)

            return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
        }
    }
})

actions.callbackQuery(/airing_\d+_\d+/i, async (ctx) => {
    if ('data' in ctx.callbackQuery) {
        const [page, userId] = ctx.callbackQuery.data.replace(/airing_/i, '').split('_')
        if (page && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            const skip = (parseInt(page) - 1) * 10

            const animes = await prisma.anime.findMany({
                where: {
                    userId: userId,
                    onAir: true
                },
                take: 11,
                skip: skip,
                orderBy: [
                    {
                        updatedAt: { sort: 'desc', nulls: 'last' },
                    }, {
                        id: 'desc'
                    }
                ]
            })

            const animelist = animes.slice(0, 10).map(anime => `<code>${escapeHtml(anime.name)}</code> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

            const text = `<b>Anime marked as 'On Air' stored for you:</b>\n\n${animelist}`

            const keyboard = new InlineKeyboard()
            for (const anime of animes.slice(0, 10)) {
                keyboard.text(`"${anime.name}"`, `animeInfo_${anime.id}_${userId}_airing`).row()
            }
            if (parseInt(page) > 1)
                keyboard.text('⏮', `airing_${parseInt(page) - 1}_${userId}`)
            if (animes.length > 10)
                keyboard.text('⏭', `airing_${parseInt(page) + 1}_${userId}`)

            return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
        }
    }
})

actions.callbackQuery(/Local_\d+_\d+_.+/i, async (ctx) => {
    if ('data' in ctx.callbackQuery) {
        const data = ctx.callbackQuery.data.replace(/Local_/i, '')
        const firstUnderscore = data.indexOf('_')
        const secondUnderscore = data.indexOf('_', firstUnderscore + 1)
        const page = data.substring(0, firstUnderscore)
        const userId = data.substring(firstUnderscore + 1, secondUnderscore)
        const query = decodeURIComponent(data.substring(secondUnderscore + 1))
        if (page && userId && query) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

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
                orderBy: [
                    {
                        updatedAt: { sort: 'desc', nulls: 'last' },
                    }, {
                        id: 'desc'
                    }
                ]
            })

            const animelist = animes.map(anime => `<code>${escapeHtml(anime.name)}</code> <b>[S${padTo2Digits(anime.season)}E${padTo2Digits(anime.episode)}]</b>`).join('\n')

            const text = `<b>Anime stored for you:</b>\n\n${animelist}`

            const keyboard = new InlineKeyboard()
            for (const anime of animes) {
                keyboard.text(`"${anime.name}"`, `animeInfo_${anime.id}_${userId}`).row()
            }
            if (parseInt(page) > 1)
                keyboard.text('⏮', `myanime_${parseInt(page) - 1}_${userId}`)
            if (animes.length > 10)
                keyboard.text('⏭', `myanime_${parseInt(page) + 1}_${userId}`)
            keyboard.row()
            keyboard.text('💾 Export .txt 💾', `txt_${userId}`)

            return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
        }
    }
})

// afm = add from menu
actions.callbackQuery(/afm_\d+_\d+_\d+_\d+/i, async (ctx) => {
    if ('data' in ctx.callbackQuery) {
        const [season, episode, user, animeId] = ctx.callbackQuery.data.replace(/afm_/i, '').split('_')
        try {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== user) {
                await ctx.answerCallbackQuery('This is not your menu').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            const results = await getAnime(parseInt(animeId))
            if (!results) return logger.error('Anime not found')
            const anime = results.Media
            const nativeTitle = anime.title.native
            const romajiTitle = anime.title.romaji
            const note = `Native: ${nativeTitle}\nRomaji: ${romajiTitle}\nAdded from the menu`
            await prisma.anime
                .upsert({
                    where: {
                        name_userId: {
                            name: anime.title.english.trim(),
                            userId: user
                        }
                    },
                    create: {
                        name: anime.title.english.trim(),
                        anilistId: anime.id,
                        season: parseInt(season),
                        episode: parseInt(episode),
                        note,
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
                        note,
                        anilistId: anime.id,
                        onAir: anime.nextAiringEpisode?.airingAt ? true : false,
                    }
                })
                .then(() => logger.info('Anime added/updated!'))
                .catch(logger.error)

        } catch (error) {
            logger.error(error)
        }
    }
})

actions.callbackQuery(/adf_\d+_\d+/i, async (ctx) => {
    if (!('data' in ctx.callbackQuery)) return

    const [animeId, userId] = ctx.callbackQuery.data.replace(/adf_/i, '').split('_')
    if (ctx.callbackQuery.from.id.toString() !== userId) {
        await ctx.answerCallbackQuery('This is not your anime').catch(e => logger.error(e))
        return
    }

    await ctx.answerCallbackQuery('Fetching details...').catch(logger.error)

    const anime = await prisma.anime.findUnique({ where: { id: parseInt(animeId) } })
    if (!anime) {
        await ctx.reply('Anime not found').catch(logger.error)
        return
    }

    if (anime.anilistId) {
        const details = await getBestDetails('anime', anime)
        if (!details) {
            await ctx.reply('No details found for this anime.')
            return
        }

        const keyboard = new InlineKeyboard()
            .text('Save details', `ads_${animeId}_${userId}_${details.provider}_${encodeURIComponent(details.id)}`).row()
            .text('Cancel', `animeInfo_${animeId}_${userId}`)

        return ctx.reply(detailsPreviewText(details), { parse_mode: 'HTML', reply_markup: keyboard }).catch(logger.error)
    }

    const results = await searchDetails('anime', anime.name, 5)
    if (results.length < 1) {
        await ctx.reply('No details found for this anime.')
        return
    }

    const keyboard = new InlineKeyboard()
    for (const details of results.slice(0, 8)) {
        keyboard.text(detailButtonLabel(details), `adp_${animeId}_${userId}_${details.provider}_${encodeURIComponent(details.id)}`).row()
    }
    keyboard.text('Cancel', `animeInfo_${animeId}_${userId}`)

    return ctx.reply(`Select details for <b>${escapeHtml(anime.name)}</b>:`, { parse_mode: 'HTML', reply_markup: keyboard }).catch(logger.error)
})

actions.callbackQuery(/adp_\d+_\d+_[^_]+_.+/i, async (ctx) => {
    if (!('data' in ctx.callbackQuery)) return

    const parsed = parseDetailAction(ctx.callbackQuery.data, 'adp')
    if (!parsed) return

    const { recordId, userId, provider, providerId } = parsed
    if (ctx.callbackQuery.from.id.toString() !== userId) {
        await ctx.answerCallbackQuery('This is not your anime').catch(e => logger.error(e))
        return
    }

    await ctx.answerCallbackQuery().catch(logger.error)

    const details = await getDetailsByProvider('anime', provider, providerId)
    if (!details) {
        await ctx.reply('Could not load those details.')
        return
    }

    const keyboard = new InlineKeyboard()
        .text('Save details', `ads_${recordId}_${userId}_${details.provider}_${encodeURIComponent(details.id)}`).row()
        .text('Cancel', `animeInfo_${recordId}_${userId}`)

    return ctx.reply(detailsPreviewText(details), { parse_mode: 'HTML', reply_markup: keyboard }).catch(logger.error)
})

actions.callbackQuery(/ads_\d+_\d+_[^_]+_.+/i, async (ctx) => {
    if (!('data' in ctx.callbackQuery)) return

    const parsed = parseDetailAction(ctx.callbackQuery.data, 'ads')
    if (!parsed) return

    const { recordId, userId, provider, providerId } = parsed
    if (ctx.callbackQuery.from.id.toString() !== userId) {
        await ctx.answerCallbackQuery('This is not your anime').catch(e => logger.error(e))
        return
    }

    const details = await getDetailsByProvider('anime', provider, providerId)
    if (!details) {
        await ctx.answerCallbackQuery('Could not load details').catch(logger.error)
        return
    }

    await prisma.anime.update({
        where: { id: parseInt(recordId) },
        data: toAnimeUpdate(details),
    })

    await ctx.answerCallbackQuery('Details saved!').catch(logger.error)
    return ctx.reply(`Saved details from <b>${escapeHtml(details.providerLabel)}</b> for <b>${escapeHtml(details.title)}</b>.`, { parse_mode: 'HTML' }).catch(logger.error)
})

actions.callbackQuery(/deleteAnime_/, async (ctx) => {
    try {
        if ('data' in ctx.callbackQuery && !ctx.callbackQuery.inline_message_id) {
            const [animeId, userId] = ctx.callbackQuery.data.replace(/deleteAnime_/i, '').split('_')
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your menu').catch(e => logger.error(e))
                return
            }
            await prisma.anime.delete({
                where: {
                    id: parseInt(animeId)
                }
            }).then(() => {
                ctx.answerCallbackQuery('Anime deleted!').catch(logger.error)
                ctx.reply('Your anime record was deleted.\nIf you made a mistake, just send the <code>monospaced text</code> in the previous message.', { parse_mode: 'HTML' })
            }).catch(() => ctx.answerCallbackQuery().catch(logger.error))
        }
    } catch (error) {
        logger.error(error)
    }
})

function detailButtonLabel(details: { providerLabel: string, title: string }) {
    const title = details.title.length > 32 ? `${details.title.slice(0, 29)}...` : details.title
    return `${details.providerLabel}: ${title}`
}

function detailsPreviewText(details: Parameters<typeof summarizeDetails>[0]) {
    return `<b>Preview details to save</b>\n\n${summarizeDetails(details)}`
}

function parseDetailAction(data: string, prefix: string) {
    const parts = data.replace(new RegExp(`^${prefix}_`, 'i'), '').split('_')
    const [recordId, userId, provider, ...providerIdParts] = parts
    const providerId = providerIdParts.join('_')

    if (!recordId || !userId || !provider || !providerId) return null

    return {
        recordId,
        userId,
        provider,
        providerId: decodeURIComponent(providerId),
    }
}

export default actions
