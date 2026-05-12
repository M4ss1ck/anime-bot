import { Composer, InlineKeyboard, InputFile } from 'grammy'
import { logger } from '../logger/index.js'
import { getNovel, getNovels } from '../anilist-service/index.js'
import { prisma } from '../db/prisma.js'
import { escapeHtml } from '../utils/index.js'
import * as fs from 'fs/promises'
import { getBestDetails, getDetailsByProvider, searchDetails, summarizeDetails, toReadingUpdate } from '../details-service/index.js'

const btn = (text: string, callback_data: string) => ({ text, callback_data })

const novel = new Composer()

novel.command('novel', async (ctx) => {
    const search = ctx.message!.text.replace(/^\/novel((@\w+)?\s+)?/i, '')
    if (search.length > 2) {
        // buscar en AniList
        try {
            const results = await getNovels(search)
            const media = results.Page?.media
            if (media && media.length > 0) {
                const buttons = []
                for (const novel of media)
                    buttons.push([btn(novel.title.romaji ?? 'placeholder text', `getNovel${novel.id}`)])

                buttons.push([
                    btn('⏭', `NovelPage${2}-${encodeURIComponent(search)}`),
                ])

                const keyboard = InlineKeyboard.from(buttons)
                const text = `Results for <b>${escapeHtml(search)}</b>`

                return ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard })
            }
            else {
                return ctx.reply('No novel found.', { parse_mode: 'HTML' })
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

novel.callbackQuery(/NovelPage\d+-/i, async (ctx) => {
    ctx.answerCallbackQuery().catch(logger.error)
    const pageString = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data?.match(/NovelPage(\d+)/i)?.[1] : null
    const page = parseInt(pageString ?? '1')
    const search = 'data' in ctx.callbackQuery ? decodeURIComponent(ctx.callbackQuery.data?.replace(/NovelPage\d+-/i, '') ?? '') : ''
    if (search && search.length > 2) {
        // buscar en AniList
        try {
            const results = await getNovels(search, page)
            const media = results.Page?.media
            const total = results.Page?.pageInfo?.total as number ?? 1
            const perPage = results.Page?.pageInfo?.perPage as number ?? 5
            if (media && media.length > 0) {
                const buttons = []
                for (const novel of media)
                    buttons.push([btn(novel.title.romaji ?? 'placeholder text', `getNovel${novel.id}`)])

                const showPrevBtn = page >= 2
                const showNextBtn = total / perPage > page

                const lastRow = []
                showPrevBtn && lastRow.push(btn('⏮', `NovelPage${page - 1}-${encodeURIComponent(search)}`))
                showNextBtn && lastRow.push(btn('⏭', `NovelPage${page + 1}-${encodeURIComponent(search)}`))

                buttons.push(lastRow)

                return ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: buttons } })
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

novel.callbackQuery(/getNovel/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(logger.error)
    const novelId = parseInt('data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace('getNovel', '') : '')
    if (!isNaN(novelId)) {
        // buscar en AniList
        try {
            const results = await getNovel(novelId)
            const media = results.Media
            if (media) {
                const caption = `<b>${media.title.romaji ?? 'Title'}</b> (${media.id})\n<i>${media.title.english ?? ''}</i>
Genres: ${media.genres ? media.genres.join(', ') : 'n/a'}\nVolumes: ${media.volumes ?? 'n/a'}  Chapters: ${media.chapters ?? 'n/a'}\nScore: ${media.averageScore ?? 'n/a'}\nStatus: ${media.status ?? 'n/a'}\nSource: ${media.source ?? 'n/a'}\n\n<i>${media.description ? escapeHtml(media.description) : 'description n/a'}`

                const cover = media.coverImage.large

                const addAction = `nfm_${ctx.from?.id}_${novelId}`.slice(0, 63)
                const buttons = [[btn('Add to my list', addAction)]]
                const keyboard = InlineKeyboard.from(buttons)

                return !ctx.callbackQuery.inline_message_id
                    ? ctx.replyWithPhoto(cover, {
                        caption: `${caption.slice(0, 1020)}</i>`,
                        parse_mode: 'HTML',
                        reply_markup: keyboard,
                    }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
                    : ctx.editMessageText(`${caption.slice(0, 4090)}</i>`, { parse_mode: "HTML" }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
            }
            else {
                return ctx.reply('No novel found.', { parse_mode: 'HTML' })
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

novel.command(['mynovel', 'mynovels'], async (ctx) => {
    const novels = await prisma.novel.findMany({
        where: {
            userId: ctx.from!.id.toString()
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

    if (novels.length > 0) {
        const novelList = novels.slice(0, 10).map(novel => `<code>${escapeHtml(novel.name)}</code><b>${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}</b>`).join('\n')

        const text = `<b>Novels stored for you:</b>\n\n${novelList}`

        const buttons = novels.slice(0, 10).map(novels => [btn(`"${novels.name}"`, `novelInfo_${novels.id}_${ctx.from!.id.toString()}`)])

        buttons.push([
            btn('⏭', `mynovel_2_${ctx.from!.id.toString()}`)
        ])

        buttons.push([
            btn('💾 Export .txt 💾', `ntxt_${ctx.from!.id.toString()}`),
        ])

        const keyboard = InlineKeyboard.from(buttons)

        return ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard })
    }
    else {
        return ctx.reply('<i>No novels found on DB</i>\n\nAdd some!', { parse_mode: 'HTML' })
    }
})

novel.command(['releasing', 'r'], async (ctx) => {
    const novels = await prisma.novel.findMany({
        where: {
            userId: ctx.from!.id.toString(),
            releasing: true
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

    if (novels.length > 0) {
        const novelList = novels.slice(0, 10).map(novel => `<code>${escapeHtml(novel.name)}</code><b>${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}</b>`).join('\n')

        const text = `<b>Novels marked as 'RELEASING' stored for you:</b>\n\n${novelList}`

        const buttons = novels.slice(0, 10).map(novel => [btn(`"${novel.name}"`, `novelInfo_${novel.id}_${ctx.from!.id.toString()}_rel`)])

        buttons.push([
            btn('⏭', `releasing_2_${ctx.from!.id.toString()}`)
        ])

        const keyboard = InlineKeyboard.from(buttons)

        return ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard })
    }
    else {
        return ctx.reply('<i>No novel marked as "RELEASING" found on DB</i>\n\nAdd some!', { parse_mode: 'HTML' })
    }
})

novel.command('nsave', async ctx => {
    const regex = /^\/nsave (part\d+\s)?(vol\d+\s)?(ch\d+\s)?(.+)([\r\n\u0085\u2028\u2029]+(.+)?)?/i
    if (regex.test(ctx.message!.text)) {
        try {
            const match = ctx.message!.text.match(regex)
            if (match) {
                const partValue = match[1] ? match[1].trim().replace('part', '') : null;
                const volValue = match[2] ? match[2].trim().replace('vol', '') : null;
                const chValue = match[3] ? match[3].trim().replace('ch', '') : null;
                const name = match[4] ? match[4].trim() : null
                const note = ctx.message!.text.replace(/^\/nsave (part\d+\s)?(vol\d+\s)?(ch\d+\s)?(.+)([\r\n\u0085\u2028\u2029]+)?/i, '')
                if (name) {
                    await prisma.novel
                        .upsert({
                            where: {
                                name_userId: {
                                    name: name,
                                    userId: ctx.from!.id.toString()
                                }
                            },
                            create: {
                                name: name.trim(),
                                part: partValue ? parseInt(partValue) : null,
                                volume: volValue ? Number(volValue) : null,
                                chapter: chValue ? parseInt(chValue) : null,
                                note,
                                user: {
                                    connectOrCreate: {
                                        where: {
                                            id: ctx.from!.id.toString(),
                                        },
                                        create: {
                                            id: ctx.from!.id.toString(),
                                        }
                                    }
                                }
                            },
                            update: {
                                part: partValue ? parseInt(partValue) : null,
                                volume: volValue ? Number(volValue) : null,
                                chapter: chValue ? parseInt(chValue) : null,
                                note,
                            }
                        })
                        .then(() => ctx.reply('Done'))
                        .catch((e) => {
                            logger.error(e)
                            ctx.reply('Error creating/updating that record')
                        })
                }
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

novel.callbackQuery(/novelInfo_\d+_\d+(_\w+)?/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [novelId, userId, releasing] = ctx.callbackQuery.data.replace(/novelInfo_/i, '').split('_')

        if (novelId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your list').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            const novel = await prisma.novel.findUnique({
                where: {
                    id: parseInt(novelId)
                }
            })

            if (novel) {
                const buttons = []

                if (novel.part)
                    buttons.push([
                        btn('Part', `partAlert`),
                        btn('➖', `partMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        btn('➕', `partPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.volume)
                    buttons.push([
                        btn('Volume', `volumeAlert`),
                        btn('➖', `volMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        btn('➕', `volPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.chapter)
                    buttons.push([
                        btn('Chapter', `chapterAlert`),
                        btn('➖', `chMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        btn('➕', `chPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                buttons.push([
                    btn(`RELEASING: ${novel && novel.releasing ? '✅' : '❌'}`, `toggleReleasing_${novelId}_${userId}_${novel && novel.releasing ? 'off' : 'on'}${releasing ? '_rel' : ''}`)
                ])
                buttons.push([
                    btn('Fetch details', `ndf_${novelId}_${userId}`)
                ])
                buttons.push([
                    btn(`🗑 DELETE 🗑`, `deleteNovel_${novelId}_${userId}`)
                ])
                if (releasing) {
                    buttons.push([
                        btn('🔙 Full list', `releasing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        btn('🔙 Full list', `mynovel_1_${userId}`)
                    ])
                }

                const keyboard = InlineKeyboard.from(buttons)

                let text = ''
                if (novel) {
                    text += `<b>Name:</b> ${escapeHtml(novel.name)}`
                    if (novel.part) {
                        text += `\n<b>Part:</b> ${novel.part}`
                    }
                    if (novel.volume) {
                        text += `\n<b>Volume:</b> ${novel.volume}`
                    }
                    if (novel.chapter) {
                        text += `\n<b>Chapter:</b> ${novel.chapter}`
                    }
                    if (novel.note) {
                        text += `\n<b>Note:</b>\n${novel.note && novel.note.length > 0 ? escapeHtml(novel.note) : '-'}`
                    }
                    text += `\n\n<i>To edit the values, you could use the buttons or modify the following code:</i><pre>/nsave${novel.part ? " part" + novel.part : ""}${novel.volume ? " vol" + novel.volume : ""}${novel.chapter ? " ch" + novel.chapter : ""} ${escapeHtml(novel.name)}\n${escapeHtml(novel.note || '')}</pre>`
                } else {
                    text += '<b>Novel not found for this id</b>'
                }

                return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
            }
        }
    }
})

novel.callbackQuery(/(part|vol|ch)(Minus|Plus)_\d+_\d+(_\w+)?/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [novelId, userId, releasing] = ctx.callbackQuery.data.replace(/(part|vol|ch)(Minus|Plus)_/i, '').split('_')
        const isMinus = /(part|vol|ch)Minus_/i.test(ctx.callbackQuery.data ?? '')
        const isPart = /part(Minus|Plus)_/i.test(ctx.callbackQuery.data ?? '')
        const isVolume = /vol(Minus|Plus)_/i.test(ctx.callbackQuery.data ?? '')
        // const isChapter = /ch(Minus|Plus)_/i.test(ctx.callbackQuery.data ?? '')
        if (novelId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            const increment = !isMinus ? 1 : -1

            const propertyName = isPart ? 'part' : isVolume ? 'volume' : 'chapter'

            await prisma.novel.update({
                where: {
                    id: parseInt(novelId)
                },
                data: {
                    [propertyName]: {
                        increment
                    },
                }
            }).then((novel) => {
                const buttons = []

                if (novel.part)
                    buttons.push([
                        btn('Part', `partAlert`),
                        btn('➖', `partMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        btn('➕', `partPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.volume)
                    buttons.push([
                        btn('Volume', `volumeAlert`),
                        btn('➖', `volMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        btn('➕', `volPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.chapter)
                    buttons.push([
                        btn('Chapter', `chapterAlert`),
                        btn('➖', `chMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        btn('➕', `chPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                buttons.push([
                    btn(`RELEASING: ${novel && novel.releasing ? '✅' : '❌'}`, `toggleReleasing_${novelId}_${userId}_${novel && novel.releasing ? 'off' : 'on'}${releasing ? '_rel' : ''}`)
                ])
                buttons.push([
                    btn('Fetch details', `ndf_${novelId}_${userId}`)
                ])
                buttons.push([
                    btn(`🗑 DELETE 🗑`, `deleteNovel_${novelId}_${userId}`)
                ])
                if (releasing) {
                    buttons.push([
                        btn('🔙 Full list', `releasing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        btn('🔙 Full list', `mynovel_1_${userId}`)
                    ])
                }

                const keyboard = InlineKeyboard.from(buttons)

                let text = ''
                if (novel) {
                    text += `<b>Name:</b> ${escapeHtml(novel.name)}`
                    if (novel.part) {
                        text += `\n<b>Part:</b> ${novel.part}`
                    }
                    if (novel.volume) {
                        text += `\n<b>Volume:</b> ${novel.volume}`
                    }
                    if (novel.chapter) {
                        text += `\n<b>Chapter:</b> ${novel.chapter}`
                    }
                    if (novel.note) {
                        text += `\n<b>Note:</b>\n${novel.note && novel.note.length > 0 ? escapeHtml(novel.note) : '-'}`
                    }
                    text += `\n\n<i>To edit the values, you could use the buttons or modify the following code:</i><pre>/nsave${novel.part ? " part" + novel.part : ""}${novel.volume ? " vol" + novel.volume : ""}${novel.chapter ? " ch" + novel.chapter : ""} ${escapeHtml(novel.name)}\n${escapeHtml(novel.note || '')}</pre>`
                } else {
                    text += '<b>Novel not found for this id</b>'
                }

                return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
            }).catch(logger.error)
        }
    }

})

novel.callbackQuery(/(chapter|volume|part)Alert/i, ctx => {
    if ('data' in ctx.callbackQuery) {
        const type = /chapter/i.test(ctx.callbackQuery.data) ? 'chapter' : /volume/i.test(ctx.callbackQuery.data) ? 'volume' : 'part'
        return ctx.api
            .answerCallbackQuery(ctx.callbackQuery.id, { text: `Use the ➖ and ➕ buttons to modify the ${type}`, show_alert: true })
            .catch(e => logger.error(e))
    }
})

novel.callbackQuery(/toggleReleasing_\d+_\d+_(on|off)(_\w+)?/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [novelId, userId, value, releasing] = ctx.callbackQuery.data.replace(/toggleReleasing_/i, '').split('_')
        if (novelId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your novel').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            await prisma.novel.update({
                where: {
                    id: parseInt(novelId)
                },
                data: {
                    releasing: value === 'on'
                }
            }).then(async novel => {
                const buttons = []

                if (novel.part)
                    buttons.push([
                        btn('Part', `partAlert`),
                        btn('➖', `partMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        btn('➕', `partPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.volume)
                    buttons.push([
                        btn('Volume', `volumeAlert`),
                        btn('➖', `volMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        btn('➕', `volPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.chapter)
                    buttons.push([
                        btn('Chapter', `chapterAlert`),
                        btn('➖', `chMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        btn('➕', `chPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                buttons.push([
                    btn(`RELEASING: ${novel && novel.releasing ? '✅' : '❌'}`, `toggleReleasing_${novelId}_${userId}_${novel && novel.releasing ? 'off' : 'on'}${releasing ? '_rel' : ''}`)
                ])
                buttons.push([
                    btn('Fetch details', `ndf_${novelId}_${userId}`)
                ])
                buttons.push([
                    btn(`🗑 DELETE 🗑`, `deleteNovel_${novelId}_${userId}`)
                ])
                if (releasing) {
                    buttons.push([
                        btn('🔙 Full list', `releasing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        btn('🔙 Full list', `mynovel_1_${userId}`)
                    ])
                }

                const keyboard = InlineKeyboard.from(buttons)

                let text = ''
                if (novel) {
                    text += `<b>Name:</b> ${escapeHtml(novel.name)}`
                    if (novel.part) {
                        text += `\n<b>Part:</b> ${novel.part}`
                    }
                    if (novel.volume) {
                        text += `\n<b>Volume:</b> ${novel.volume}`
                    }
                    if (novel.chapter) {
                        text += `\n<b>Chapter:</b> ${novel.chapter}`
                    }
                    if (novel.note) {
                        text += `\n<b>Note:</b>\n${novel.note && novel.note.length > 0 ? escapeHtml(novel.note) : '-'}`
                    }
                    text += `\n\n<i>To edit the values, you could use the buttons or modify the following code:</i><pre>/nsave${novel.part ? " part" + novel.part : ""}${novel.volume ? " vol" + novel.volume : ""}${novel.chapter ? " ch" + novel.chapter : ""} ${escapeHtml(novel.name)}\n${escapeHtml(novel.note || '')}</pre>`
                } else {
                    text += '<b>Novel not found for this id</b>'
                }

                return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
            }).catch(logger.error)
        }
    }
})

novel.callbackQuery(/ntxt_\d+/, async ctx => {
    await ctx.answerCallbackQuery().catch(e => logger.error(e))
    const userId = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace(/ntxt_/i, '') : '123'
    const fileName = `${userId}_novels.txt`

    if (userId !== ctx.callbackQuery.from.id.toString()) {
        await ctx.answerCallbackQuery('This is not your list').catch(e => logger.error(e))
    }
    else {
        const novels = await prisma.novel.findMany({
            where: {
                userId: userId
            },
            orderBy: [
                {
                    updatedAt: { sort: 'desc', nulls: 'last' },
                }, {
                    id: 'desc'
                }
            ]
        })

        const novelList = novels.map(novel => `${novel.name} ${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}`).join('\n')

        await fs.writeFile(fileName, novelList)

        await ctx.replyWithDocument(new InputFile(fileName, `novels_${Date.now()}.txt`), { caption: 'Your list of novels' })

        await fs.unlink(fileName).catch(logger.error)
    }
})

novel.callbackQuery(/mynovel_\d+_\d+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [page, userId] = ctx.callbackQuery.data.replace(/mynovel_/i, '').split('_')
        if (page && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your novel').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            const skip = (parseInt(page) - 1) * 10

            const novels = await prisma.novel.findMany({
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

            const novelList = novels.slice(0, 10).map(novel => `<code>${escapeHtml(novel.name)}</code><b>${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}</b>`).join('\n')

            const text = `<b>Novels stored for you:</b>\n\n${novelList}`

            const buttons = novels.slice(0, 10).map(novel => [btn(`"${novel.name}"`, `novelInfo_${novel.id}_${userId}`)])

            const navRow = []
            if (parseInt(page) > 1) navRow.push(btn('⏮', `mynovel_${parseInt(page) - 1}_${userId}`))
            if (novels.length > 10) navRow.push(btn('⏭', `mynovel_${parseInt(page) + 1}_${userId}`))
            if (navRow.length > 0) buttons.push(navRow)

            buttons.push([
                btn('💾 Export .txt 💾', `ntxt_${userId}`),
            ])

            const keyboard = InlineKeyboard.from(buttons)

            return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
        }
    }
})

novel.callbackQuery(/releasing_\d+_\d+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [page, userId] = ctx.callbackQuery.data.replace(/releasing_/i, '').split('_')
        if (page && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your novel').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(e => logger.error(e))

            const skip = (parseInt(page) - 1) * 10

            const novels = await prisma.novel.findMany({
                where: {
                    userId: userId,
                    releasing: true
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

            const novelList = novels.slice(0, 10).map(novel => `<code>${escapeHtml(novel.name)}</code><b>${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}</b>`).join('\n')

            const text = `<b>Novels marked as 'RELEASING' stored for you:</b>\n\n${novelList}`

            const buttons = novels.slice(0, 10).map(novel => [btn(`"${novel.name}"`, `novelInfo_${novel.id}_${userId}_rel`)])

            const navRow = []
            if (parseInt(page) > 1) navRow.push(btn('⏮', `releasing_${parseInt(page) - 1}_${userId}`))
            if (novels.length > 10) navRow.push(btn('⏭', `releasing_${parseInt(page) + 1}_${userId}`))
            if (navRow.length > 0) buttons.push(navRow)

            const keyboard = InlineKeyboard.from(buttons)

            return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
        }
    }
})

novel.callbackQuery(/ndf_\d+_\d+/i, async ctx => {
    if (!('data' in ctx.callbackQuery)) return

    const [novelId, userId] = ctx.callbackQuery.data.replace(/ndf_/i, '').split('_')
    if (ctx.callbackQuery.from.id.toString() !== userId) {
        await ctx.answerCallbackQuery('This is not your novel').catch(e => logger.error(e))
        return
    }

    await ctx.answerCallbackQuery('Fetching details...').catch(logger.error)

    const savedNovel = await prisma.novel.findUnique({ where: { id: parseInt(novelId) } })
    if (!savedNovel) {
        await ctx.reply('Novel not found').catch(logger.error)
        return
    }

    if (savedNovel.anilistId) {
        const details = await getBestDetails('reading', savedNovel)
        if (!details) {
            await ctx.reply('No details found for this reading item.')
            return
        }

        return ctx.reply(detailsPreviewText(details), { parse_mode: 'HTML', reply_markup: InlineKeyboard.from([
            [btn('Save details', `nds_${novelId}_${userId}_${details.provider}_${encodeURIComponent(details.id)}`)],
            [btn('Cancel', `novelInfo_${novelId}_${userId}`)],
        ]) }).catch(logger.error)
    }

    const results = await searchDetails('reading', savedNovel.name, 5)
    if (results.length < 1) {
        await ctx.reply('No details found for this reading item.')
        return
    }

    const buttons = results.slice(0, 8).map(details => [
        btn(detailButtonLabel(details), `ndp_${novelId}_${userId}_${details.provider}_${encodeURIComponent(details.id)}`),
    ])
    buttons.push([btn('Cancel', `novelInfo_${novelId}_${userId}`)])

    return ctx.reply(`Select details for <b>${escapeHtml(savedNovel.name)}</b>:`, { parse_mode: 'HTML', reply_markup: InlineKeyboard.from(buttons) }).catch(logger.error)
})

novel.callbackQuery(/ndp_\d+_\d+_[^_]+_.+/i, async ctx => {
    if (!('data' in ctx.callbackQuery)) return

    const parsed = parseDetailAction(ctx.callbackQuery.data, 'ndp')
    if (!parsed) return

    const { recordId, userId, provider, providerId } = parsed
    if (ctx.callbackQuery.from.id.toString() !== userId) {
        await ctx.answerCallbackQuery('This is not your novel').catch(e => logger.error(e))
        return
    }

    await ctx.answerCallbackQuery().catch(logger.error)

    const details = await getDetailsByProvider('reading', provider, providerId)
    if (!details) {
        await ctx.reply('Could not load those details.')
        return
    }

    return ctx.reply(detailsPreviewText(details), { parse_mode: 'HTML', reply_markup: InlineKeyboard.from([
        [btn('Save details', `nds_${recordId}_${userId}_${details.provider}_${encodeURIComponent(details.id)}`)],
        [btn('Cancel', `novelInfo_${recordId}_${userId}`)],
    ]) }).catch(logger.error)
})

novel.callbackQuery(/nds_\d+_\d+_[^_]+_.+/i, async ctx => {
    if (!('data' in ctx.callbackQuery)) return

    const parsed = parseDetailAction(ctx.callbackQuery.data, 'nds')
    if (!parsed) return

    const { recordId, userId, provider, providerId } = parsed
    if (ctx.callbackQuery.from.id.toString() !== userId) {
        await ctx.answerCallbackQuery('This is not your novel').catch(e => logger.error(e))
        return
    }

    const details = await getDetailsByProvider('reading', provider, providerId)
    if (!details) {
        await ctx.answerCallbackQuery('Could not load details').catch(logger.error)
        return
    }

    await prisma.novel.update({
        where: { id: parseInt(recordId) },
        data: toReadingUpdate(details),
    })

    await ctx.answerCallbackQuery('Details saved!').catch(logger.error)
    return ctx.reply(`Saved details from <b>${escapeHtml(details.providerLabel)}</b> for <b>${escapeHtml(details.title)}</b>.`, { parse_mode: 'HTML' }).catch(logger.error)
})

novel.callbackQuery(/deleteNovel_/, async ctx => {
    try {
        if ('data' in ctx.callbackQuery && !ctx.callbackQuery.inline_message_id) {
            const [novelId, userId] = ctx.callbackQuery.data.replace(/deleteNovel_/i, '').split('_')
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCallbackQuery('This is not your menu').catch(e => logger.error(e))
                return
            }
            await prisma.novel.delete({
                where: {
                    id: parseInt(novelId)
                }
            }).then(async () => {
                await ctx.answerCallbackQuery('Novel deleted!').catch(logger.error)
                return ctx.reply('Your novel record was deleted.\nIf you made a mistake, just send the <code>monospaced text</code> in the previous message.', { parse_mode: 'HTML' })
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

// nfm = novel from menu
novel.callbackQuery(/nfm_\d+_\d+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [user, animeId] = ctx.callbackQuery.data.replace(/nfm_/i, '').split('_')
        try {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== user) {
                await ctx.answerCallbackQuery('This is not your menu').catch(e => logger.error(e))
                return
            }

            await ctx.answerCallbackQuery().catch(logger.error)

            const results = await getNovel(parseInt(animeId))
            if (!results) return logger.error('Error with novel update/add')
            const novel = results.Media
            const note = `${novel.title.romaji ?? 'Title'} (${novel.id})\n${novel.title.english ?? ''}\nGenres: ${novel.genres ? novel.genres.join(', ') : 'n/a'}\nVolumes: ${novel.volumes ?? 'n/a'}  Chapters: ${novel.chapters ?? 'n/a'}\nScore: ${novel.averageScore ?? 'n/a'}\nStatus: ${novel.status ?? 'n/a'}\nSource: ${novel.source ?? 'n/a'}`
            await prisma.novel
                .upsert({
                    where: {
                        name_userId: {
                            name: novel.title.english.trim(),
                            userId: user
                        }
                    },
                    create: {
                        name: novel.title.english.trim(),
                        anilistId: novel.id,
                        volume: 1,
                        note,
                        releasing: /releasing/i.test(novel.status) ? true : false,
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
                        anilistId: novel.id,
                    }
                })
                .then(() => logger.info('Anime added/updated!'))
                .catch(logger.error)

        } catch (error) {
            logger.error(error)
        }
    }
})

export default novel
