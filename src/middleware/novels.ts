import { Composer, Markup } from 'telegraf'
import { logger } from '../logger/index.js'
import { getNovel, getNovels } from '../anilist-service/index.js'
import { prisma } from '../db/prisma.js'

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
                    Markup.button.callback('⏭', `NovelPage${2}-${search}`, total / perPage <= 1),
                ])

                const keyboard = Markup.inlineKeyboard(buttons)
                const text = `Results for <b>${search}</b>`

                ctx.replyWithHTML(text, keyboard)
            }
            else {
                ctx.replyWithHTML('No novel found.')
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

                ctx.editMessageReplyMarkup({
                    inline_keyboard: buttons,
                })
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

novel.action(/getNovel/, async (ctx) => {
    ctx.answerCbQuery().catch(logger.error)
    const novelId = parseInt('data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace('getNovel', '') : '')
    if (!isNaN(novelId)) {
        // buscar en AniList
        try {
            const results = await getNovel(novelId)
            const media = results.Media
            if (media) {
                const caption = `<b>${media.title.romaji ?? 'Title'}</b> (${media.id})
<i>${media.title.english ?? ''}</i>
Genres: ${media.genres ? media.genres.join(', ') : 'n/a'}
Volumes: ${media.volumes ?? 'n/a'}  Chapters: ${media.chapters ?? 'n/a'}
Score: ${media.averageScore ?? 'n/a'}
Status: ${media.status ?? 'n/a'}
Source: ${media.source ?? 'n/a'}
      
<i>${media.description?.replace(/<(\/)?\w+((\s)?\/)?>/g, '') ?? 'description n/a'}`

                const cover = media.coverImage.large

                !ctx.callbackQuery.inline_message_id
                    ? ctx.replyWithPhoto(cover, {
                        parse_mode: 'HTML',
                        caption: `${caption.slice(0, 1020)}</i>`,
                    }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
                    : ctx.editMessageText(`${caption.slice(0, 4090)}</i>`, { parse_mode: "HTML" }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
            }
            else {
                ctx.replyWithHTML('No novel found.')
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

        ctx.replyWithHTML(text, keyboard)
    }
    else {
        ctx.replyWithHTML('<i>No novels found on DB</i>\n\nAdd some!')
    }
})

export default novel