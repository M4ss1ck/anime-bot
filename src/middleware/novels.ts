import { Composer, Markup } from 'telegraf'
import { logger } from '../logger/index.js'
import { getNovel, getNovels } from '../anilist-service/index.js'
import { prisma } from '../db/prisma.js'
import { escape } from '../utils/index.js'
import * as fs from 'fs/promises'

const novel = new Composer()

novel.command('novel', async (ctx) => {
    const search = ctx.message.text.replace(/^\/novel((@\w+)?\s+)?/i, '')
    if (search.length > 2) {
        // buscar en AniList
        try {
            const results = await getNovels(search)
            const media = results.Page?.media
            const total = results.Page?.pageInfo?.total as number ?? 1
            const perPage = results.Page?.pageInfo?.perPage as number ?? 5
            if (media && media.length > 0) {
                const buttons = []
                for (const novel of media)
                    buttons.push([Markup.button.callback(novel.title.romaji ?? 'placeholder text', `getNovel${novel.id}`)])

                buttons.push([
                    Markup.button.callback('⏭', `NovelPage${2}-${escape(search)}`, total / perPage <= 1),
                ])

                const keyboard = Markup.inlineKeyboard(buttons)
                const text = `Results for <b>${escape(search)}</b>`

                return ctx.replyWithHTML(text, keyboard)
            }
            else {
                return ctx.replyWithHTML('No novel found.')
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

novel.action(/NovelPage\d+-/i, async (ctx) => {
    const pageString = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data?.match(/NovelPage(\d+)/i)?.[1] : null
    const page = parseInt(pageString ?? '1')
    const search = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace(/NovelPage\d+-/i, '') : ''
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
                    buttons.push([Markup.button.callback(novel.title.romaji ?? 'placeholder text', `getNovel${novel.id}`)])

                const showPrevBtn = page >= 2
                const showNextBtn = total / perPage > page

                const lastRow = []
                showPrevBtn && lastRow.push(Markup.button.callback('⏮', `NovelPage${page - 1}-${search}`))
                showNextBtn && lastRow.push(Markup.button.callback('⏭', `NovelPage${page + 1}-${search}`))

                buttons.push(lastRow)

                return ctx.editMessageReplyMarkup({
                    inline_keyboard: buttons,
                })
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

novel.action(/getNovel/, async (ctx) => {
    await ctx.answerCbQuery().catch(logger.error)
    const novelId = parseInt('data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace('getNovel', '') : '')
    if (!isNaN(novelId)) {
        // buscar en AniList
        try {
            const results = await getNovel(novelId)
            const media = results.Media
            if (media) {
                const caption = `<b>${media.title.romaji ?? 'Title'}</b> (${media.id})\n<i>${media.title.english ?? ''}</i>
Genres: ${media.genres ? media.genres.join(', ') : 'n/a'}\nVolumes: ${media.volumes ?? 'n/a'}  Chapters: ${media.chapters ?? 'n/a'}\nScore: ${media.averageScore ?? 'n/a'}\nStatus: ${media.status ?? 'n/a'}\nSource: ${media.source ?? 'n/a'}\n\n<i>${media.description ? escape(media.description) : 'description n/a'}`

                const cover = media.coverImage.large

                const addAction = `nfm_${ctx.from?.id}_${novelId}`.slice(0, 63)
                const buttons = [[Markup.button.callback('Add to my list', addAction)]]
                const keyboard = Markup.inlineKeyboard(buttons)

                return !ctx.callbackQuery.inline_message_id
                    ? ctx.replyWithPhoto(cover, {
                        parse_mode: 'HTML',
                        caption: `${caption.slice(0, 1020)}</i>`,
                        ...keyboard,
                    }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
                    : ctx.editMessageText(`${caption.slice(0, 4090)}</i>`, { parse_mode: "HTML" }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
            }
            else {
                return ctx.replyWithHTML('No novel found.')
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

novel.command(['mynovel', 'mynovels'], async (ctx) => {
    const novels = await prisma.novel.findMany({
        where: {
            userId: ctx.from.id.toString()
        },
        take: 11,
        orderBy: {
            id: 'desc'
        }
    })

    if (novels.length > 0) {
        const novelList = novels.slice(0, 10).map(novel => `<i>${novel.name}</i><b>${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}</b>`).join('\n')

        const text = `<b>Novels stored for you:</b>\n\n${novelList}`

        const buttons = novels.slice(0, 10).map(novels => [Markup.button.callback(`"${novels.name}"`, `novelInfo_${novels.id}_${ctx.from.id.toString()}`)])

        buttons.push([
            Markup.button.callback('⏭', `mynovel_2_${ctx.from.id.toString()}`, novels.length < 11)
        ])

        buttons.push([
            Markup.button.callback('💾 Export .txt 💾', `ntxt_${ctx.from.id.toString()}`),
        ])

        const keyboard = Markup.inlineKeyboard(buttons)

        return ctx.replyWithHTML(text, keyboard)
    }
    else {
        return ctx.replyWithHTML('<i>No novels found on DB</i>\n\nAdd some!')
    }
})

novel.command(['releasing', 'r'], async (ctx) => {
    const novels = await prisma.novel.findMany({
        where: {
            userId: ctx.from.id.toString(),
            releasing: true
        },
        take: 11,
        orderBy: {
            id: 'desc'
        }
    })

    if (novels.length > 0) {
        const novelList = novels.slice(0, 10).map(novel => `<i>${novel.name}</i><b>${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}</b>`).join('\n')

        const text = `<b>Novels marked as 'RELEASING' stored for you:</b>\n\n${novelList}`

        const buttons = novels.slice(0, 10).map(novel => [Markup.button.callback(`"${novel.name}"`, `novelInfo_${novel.id}_${ctx.from.id.toString()}_rel`)])

        buttons.push([
            Markup.button.callback('⏭', `releasing_2_${ctx.from.id.toString()}`, novels.length < 11)
        ])

        const keyboard = Markup.inlineKeyboard(buttons)

        return ctx.replyWithHTML(text, keyboard)
    }
    else {
        return ctx.replyWithHTML('<i>No novel marked as "RELEASING" found on DB</i>\n\nAdd some!')
    }
})

novel.command('nsave', async ctx => {
    const regex = /^\/nsave (part\d+\s)?(vol\d+\s)?(ch\d+\s)?(.+)([\r\n\u0085\u2028\u2029]+(.+)?)?/i
    if (regex.test(ctx.message.text)) {
        try {
            const match = ctx.message.text.match(regex)
            if (match) {
                const partValue = match[1] ? match[1].trim().replace('part', '') : null;
                const volValue = match[2] ? match[2].trim().replace('vol', '') : null;
                const chValue = match[3] ? match[3].trim().replace('ch', '') : null;
                const name = match[4] ? match[4].trim() : null
                const note = ctx.message.text.replace(/^\/nsave (part\d+\s)?(vol\d+\s)?(ch\d+\s)?(.+)([\r\n\u0085\u2028\u2029]+)?/i, '')
                if (name) {
                    await prisma.novel
                        .upsert({
                            where: {
                                name_userId: {
                                    name: name,
                                    userId: ctx.from.id.toString()
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
                                            id: ctx.from.id.toString(),
                                        },
                                        create: {
                                            id: ctx.from.id.toString(),
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

novel.action(/novelInfo_\d+_\d+(_\w+)?/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [novelId, userId, releasing] = ctx.callbackQuery.data.replace(/novelInfo_/i, '').split('_')

        if (novelId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your list').catch(e => logger.error(e))
                return
            }

            await ctx.answerCbQuery().catch(e => logger.error(e))

            const novel = await prisma.novel.findUnique({
                where: {
                    id: parseInt(novelId)
                }
            })

            if (novel) {
                const buttons = []

                if (novel.part)
                    buttons.push([
                        Markup.button.callback('Part', `partAlert`),
                        Markup.button.callback('➖', `partMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        Markup.button.callback('➕', `partPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.volume)
                    buttons.push([
                        Markup.button.callback('Volume', `volumeAlert`),
                        Markup.button.callback('➖', `volMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        Markup.button.callback('➕', `volPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.chapter)
                    buttons.push([
                        Markup.button.callback('Chapter', `chapterAlert`),
                        Markup.button.callback('➖', `chMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        Markup.button.callback('➕', `chPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                buttons.push([
                    Markup.button.callback(`RELEASING: ${novel && novel.releasing ? '✅' : '❌'}`, `toggleReleasing_${novelId}_${userId}_${novel && novel.releasing ? 'off' : 'on'}${releasing ? '_rel' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback(`🗑 DELETE 🗑`, `deleteNovel_${novelId}_${userId}`, !!ctx.callbackQuery.inline_message_id)
                ])
                if (releasing) {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `releasing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `mynovel_1_${userId}`)
                    ])
                }

                const keyboard = Markup.inlineKeyboard(buttons)

                let text = ''
                if (novel) {
                    text += `<b>Name:</b> ${novel.name}`
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
                        text += `\n<b>Note:</b>\n${novel.note && novel.note.length > 0 ? novel.note : '-'}`
                    }
                    text += `\n\n<i>To edit the values, you could use the buttons or modify the following code:</i><pre>/nsave${novel.part ? " part" + novel.part : ""}${novel.volume ? " vol" + novel.volume : ""}${novel.chapter ? " ch" + novel.chapter : ""} ${novel.name}\n${novel.note}</pre>`
                } else {
                    text += '<b>Novel not found for this id</b>'
                }

                return ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
            }
        }
    }
})

novel.action(/(part|vol|ch)(Minus|Plus)_\d+_\d+(_\w+)?/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [novelId, userId, releasing] = ctx.callbackQuery.data.replace(/(part|vol|ch)(Minus|Plus)_/i, '').split('_')
        const isMinus = /(part|vol|ch)Minus_/i.test(ctx.callbackQuery.data ?? '')
        const isPart = /part(Minus|Plus)_/i.test(ctx.callbackQuery.data ?? '')
        const isVolume = /vol(Minus|Plus)_/i.test(ctx.callbackQuery.data ?? '')
        // const isChapter = /ch(Minus|Plus)_/i.test(ctx.callbackQuery.data ?? '')
        if (novelId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your anime').catch(e => logger.error(e))
                return
            }

            await ctx.answerCbQuery().catch(e => logger.error(e))

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
                        Markup.button.callback('Part', `partAlert`),
                        Markup.button.callback('➖', `partMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        Markup.button.callback('➕', `partPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.volume)
                    buttons.push([
                        Markup.button.callback('Volume', `volumeAlert`),
                        Markup.button.callback('➖', `volMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        Markup.button.callback('➕', `volPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.chapter)
                    buttons.push([
                        Markup.button.callback('Chapter', `chapterAlert`),
                        Markup.button.callback('➖', `chMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        Markup.button.callback('➕', `chPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                buttons.push([
                    Markup.button.callback(`RELEASING: ${novel && novel.releasing ? '✅' : '❌'}`, `toggleReleasing_${novelId}_${userId}_${novel && novel.releasing ? 'off' : 'on'}${releasing ? '_rel' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback(`🗑 DELETE 🗑`, `deleteNovel_${novelId}_${userId}`, !!ctx.callbackQuery.inline_message_id)
                ])
                if (releasing) {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `releasing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `mynovel_1_${userId}`)
                    ])
                }

                const keyboard = Markup.inlineKeyboard(buttons)

                let text = ''
                if (novel) {
                    text += `<b>Name:</b> ${novel.name}`
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
                        text += `\n<b>Note:</b>\n${novel.note && novel.note.length > 0 ? novel.note : '-'}`
                    }
                    text += `\n\n<i>To edit the values, you could use the buttons or modify the following code:</i><pre>/nsave${novel.part ? " part" + novel.part : ""}${novel.volume ? " vol" + novel.volume : ""}${novel.chapter ? " ch" + novel.chapter : ""} ${novel.name}\n${novel.note}</pre>`
                } else {
                    text += '<b>Novel not found for this id</b>'
                }

                return ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
            }).catch(logger.error)
        }
    }

})

novel.action(/(chapter|volume|part)Alert/i, ctx => {
    if ('data' in ctx.callbackQuery) {
        const type = /chapter/i.test(ctx.callbackQuery.data) ? 'chapter' : /volume/i.test(ctx.callbackQuery.data) ? 'volume' : 'part'
        return ctx
            .answerCbQuery(`Use the ➖ and ➕ buttons to modify the ${type}`, { show_alert: true })
            .catch(e => logger.error(e))
    }
})

novel.action(/toggleReleasing_\d+_\d+_(on|off)(_\w+)?/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [novelId, userId, value, releasing] = ctx.callbackQuery.data.replace(/toggleReleasing_/i, '').split('_')
        if (novelId && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your novel').catch(e => logger.error(e))
                return
            }

            await ctx.answerCbQuery().catch(e => logger.error(e))

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
                        Markup.button.callback('Part', `partAlert`),
                        Markup.button.callback('➖', `partMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        Markup.button.callback('➕', `partPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.volume)
                    buttons.push([
                        Markup.button.callback('Volume', `volumeAlert`),
                        Markup.button.callback('➖', `volMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        Markup.button.callback('➕', `volPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                if (novel.chapter)
                    buttons.push([
                        Markup.button.callback('Chapter', `chapterAlert`),
                        Markup.button.callback('➖', `chMinus_${novelId}_${userId}${releasing ? '_airing' : ''}`),
                        Markup.button.callback('➕', `chPlus_${novelId}_${userId}${releasing ? '_airing' : ''}`)
                    ])

                buttons.push([
                    Markup.button.callback(`RELEASING: ${novel && novel.releasing ? '✅' : '❌'}`, `toggleReleasing_${novelId}_${userId}_${novel && novel.releasing ? 'off' : 'on'}${releasing ? '_rel' : ''}`)
                ])
                buttons.push([
                    Markup.button.callback(`🗑 DELETE 🗑`, `deleteNovel_${novelId}_${userId}`, !!ctx.callbackQuery.inline_message_id)
                ])
                if (releasing) {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `releasing_1_${userId}`)
                    ])
                } else {
                    buttons.push([
                        Markup.button.callback('🔙 Full list', `mynovel_1_${userId}`)
                    ])
                }

                const keyboard = Markup.inlineKeyboard(buttons)

                let text = ''
                if (novel) {
                    text += `<b>Name:</b> ${novel.name}`
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
                        text += `\n<b>Note:</b>\n${novel.note && novel.note.length > 0 ? novel.note : '-'}`
                    }
                    text += `\n\n<i>To edit the values, you could use the buttons or modify the following code:</i><pre>/nsave${novel.part ? " part" + novel.part : ""}${novel.volume ? " vol" + novel.volume : ""}${novel.chapter ? " ch" + novel.chapter : ""} ${novel.name}\n${novel.note}</pre>`
                } else {
                    text += '<b>Novel not found for this id</b>'
                }

                return ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
            }).catch(logger.error)
        }
    }
})

novel.action(/ntxt_\d+/, async ctx => {
    await ctx.answerCbQuery().catch(e => logger.error(e))
    const userId = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace(/ntxt_/i, '') : '123'
    const fileName = `${userId}_novels.txt`

    if (userId !== ctx.callbackQuery.from.id.toString()) {
        await ctx.answerCbQuery('This is not your list').catch(e => logger.error(e))
    }
    else {
        const novels = await prisma.novel.findMany({
            where: {
                userId: userId
            }
        })

        const novelList = novels.map(novel => `${novel.name} ${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}`).join('\n')

        await fs.writeFile(fileName, novelList)

        await ctx.replyWithDocument({ source: fileName, filename: `novels_${Date.now()}.txt` }, { caption: 'Your list of novels' })

        await fs.unlink(fileName).catch(logger.error)
    }
})

novel.action(/mynovel_\d+_\d+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [page, userId] = ctx.callbackQuery.data.replace(/mynovel_/i, '').split('_')
        if (page && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your novel').catch(e => logger.error(e))
                return
            }

            const skip = (parseInt(page) - 1) * 10

            const novels = await prisma.novel.findMany({
                where: {
                    userId: userId
                },
                take: 11,
                skip: skip,
                orderBy: {
                    id: 'desc'
                }
            })

            const novelList = novels.slice(0, 10).map(novel => `<i>${novel.name}</i><b>${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}</b>`).join('\n')

            const text = `<b>Novels stored for you:</b>\n\n${novelList}`

            const buttons = novels.slice(0, 10).map(novel => [Markup.button.callback(`"${novel.name}"`, `novelInfo_${novel.id}_${userId}`)])

            buttons.push([
                Markup.button.callback('⏮', `mynovel_${parseInt(page) - 1}_${userId}`, parseInt(page) < 2),
                Markup.button.callback('⏭', `mynovel_${parseInt(page) + 1}_${userId}`, novels.length < 11)
            ])

            buttons.push([
                Markup.button.callback('💾 Export .txt 💾', `ntxt_${userId}`, !!ctx.callbackQuery.inline_message_id),
            ])

            const keyboard = Markup.inlineKeyboard(buttons)

            return ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
        }
    }
})

novel.action(/releasing_\d+_\d+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [page, userId] = ctx.callbackQuery.data.replace(/releasing_/i, '').split('_')
        if (page && userId) {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your novel').catch(e => logger.error(e))
                return
            }

            const skip = (parseInt(page) - 1) * 10

            const novels = await prisma.novel.findMany({
                where: {
                    userId: userId,
                    releasing: true
                },
                take: 11,
                skip: skip,
                orderBy: {
                    id: 'desc'
                }
            })

            const novelList = novels.slice(0, 10).map(novel => `<i>${novel.name}</i><b>${novel.part ? " Part " + novel.part : ""}${novel.volume ? " vol. " + novel.volume : ""}${novel.chapter ? " chapter " + novel.chapter : ""}</b>`).join('\n')

            const text = `<b>Novels marked as 'RELEASING' stored for you:</b>\n\n${novelList}`

            const buttons = novels.slice(0, 10).map(novel => [Markup.button.callback(`"${novel.name}"`, `novelInfo_${novel.id}_${userId}_rel`)])

            buttons.push([
                Markup.button.callback('⏮', `releasing_${parseInt(page) - 1}_${userId}`, parseInt(page) < 2),
                Markup.button.callback('⏭', `releasing_${parseInt(page) + 1}_${userId}`, novels.length < 11)
            ])

            const keyboard = Markup.inlineKeyboard(buttons)

            return ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
        }
    }
})

novel.action(/deleteNovel_/, async ctx => {
    try {
        if ('data' in ctx.callbackQuery && !ctx.callbackQuery.inline_message_id) {
            const [novelId, userId] = ctx.callbackQuery.data.replace(/deleteNovel_/i, '').split('_')
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== userId) {
                await ctx.answerCbQuery('This is not your menu').catch(e => logger.error(e))
                return
            }
            await prisma.novel.delete({
                where: {
                    id: parseInt(novelId)
                }
            }).then(async () => {
                await ctx.answerCbQuery('Novel deleted!').catch(logger.error)
                return ctx.replyWithHTML('Your novel record was deleted.\nIf you made a mistake, just send the <code>monospaced text</code> in the previous message.')
            }).catch(() => ctx.answerCbQuery().catch(logger.error))
        }
    } catch (error) {
        logger.error(error)
    }
})

// nfm = novel from menu
novel.action(/nfm_\d+_\d+/i, async ctx => {
    if ('data' in ctx.callbackQuery) {
        const [user, animeId] = ctx.callbackQuery.data.replace(/nfm_/i, '').split('_')
        try {
            // check if it's the right user
            if (ctx.callbackQuery.from.id.toString() !== user) {
                await ctx.answerCbQuery('This is not your menu').catch(e => logger.error(e))
                return
            }

            const results = await getNovel(parseInt(animeId))
            if (!results) return logger.error('Error with novel update/add')
            const novel = results.Media
            const note = `${novel.title.romaji ?? 'Title'} (${novel.id})\n${novel.title.english ?? ''}\nGenres: ${novel.genres ? novel.genres.join(', ') : 'n/a'}\nVolumes: ${novel.volumes ?? 'n/a'}  Chapters: ${novel.chapters ?? 'n/a'}\nScore: ${novel.averageScore ?? 'n/a'}\nStatus: ${novel.status ?? 'n/a'}\nSource: ${novel.source ?? 'n/a'}`
            await prisma.novel
                .upsert({
                    where: {
                        name_userId: {
                            name: novel.title.romaji.trim(),
                            userId: user
                        }
                    },
                    create: {
                        name: novel.title.romaji.trim(),
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
                    }
                })
                .then(() => ctx.answerCbQuery('Anime added/updated!').catch(logger.error))
                .catch(logger.error)

        } catch (error) {
            logger.error(error)
        }
    }
})

export default novel