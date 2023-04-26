import { Composer, Markup } from 'telegraf'
import { logger } from '../logger/index.js'
import dayjs from 'dayjs'
import { getAnime, getAnimes, getCharacter, getCharacters, getIsBirthdayCharacters } from '../anilist-service/index.js'

import { convertMsToRelativeTime } from '../utils/index.js'

const anime = new Composer()

anime.command('anime', async (ctx) => {
    const search = ctx.message.text.replace(/^\/anime((@\w+)?\s+)?/i, '')
    if (search.length > 2) {
        // buscar en AniList
        try {
            const results = await getAnimes(search)
            const media = results.Page?.media
            const total = results.Page?.pageInfo?.total as number ?? 1
            const perPage = results.Page?.pageInfo?.perPage as number ?? 5
            if (media && media.length > 0) {
                const buttons = []
                for (const anime of media)
                    buttons.push([Markup.button.callback(anime.title.romaji ?? 'placeholder text', `getAnime${anime.id}`)])

                buttons.push([
                    Markup.button.callback('⏭', `AnimPage${2}-${search}`, total / perPage <= 1),
                ])

                const keyboard = Markup.inlineKeyboard(buttons)
                const text = `Results for <b>${search}</b>`

                ctx.replyWithHTML(text, keyboard)
            }
            else {
                ctx.replyWithHTML('Error. No anime found.')
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

anime.action(/AnimPage\d+-/i, async (ctx) => {
    const pageString = ctx.callbackQuery.data?.match(/AnimPage(\d+)/i)?.[1]
    const page = parseInt(pageString ?? '1')
    const search = ctx.callbackQuery.data?.replace(/AnimPage\d+-/i, '')
    if (search && search.length > 2) {
        // buscar en AniList
        try {
            const results = await getAnimes(search, page)
            const media = results.Page?.media
            const total = results.Page?.pageInfo?.total as number ?? 1
            const perPage = results.Page?.pageInfo?.perPage as number ?? 5
            if (media && media.length > 0) {
                const buttons = []
                for (const anime of media)
                    buttons.push([Markup.button.callback(anime.title.romaji ?? 'placeholder text', `getAnime${anime.id}`)])

                const showPrevBtn = page >= 2
                const showNextBtn = total / perPage > page

                const lastRow = []
                showPrevBtn && lastRow.push(Markup.button.callback('⏮', `AnimPage${page - 1}-${search}`))
                showNextBtn && lastRow.push(Markup.button.callback('⏭', `AnimPage${page + 1}-${search}`))

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

anime.action(/getAnime/, async (ctx) => {
    ctx.answerCbQuery().catch(logger.error)
    const animeId = parseInt(ctx.callbackQuery.data?.replace('getAnime', '') ?? '')
    if (!isNaN(animeId)) {
        // buscar en AniList
        try {
            const results = await getAnime(animeId)
            const media = results.Media
            if (media) {
                const caption = `<b>${media.title.romaji ?? 'Title'}</b> (${media.id})
<i>${media.title.english ?? ''}</i>
Hashtag: ${media.hashtag ?? 'n/a'}
Year: ${media.seasonYear ?? 'n/a'}  Episodes: ${media.episodes ?? 'n/a'}
${media.nextAiringEpisode ? 'Next airing episode: ' + new Date(Math.floor(media.nextAiringEpisode.airingAt * 1000)).toLocaleString('en-US') + ' <i>(in ' + convertMsToRelativeTime(media.nextAiringEpisode.airingAt * 1000 - Date.now()) + ')</i> ' : '<i>no airing info available</i>'}  
      
<i>${media.description.replace(/<(\/)?\w+((\s)?\/)?>/g, '') ?? 'description n/a'}`

                const cover = media.coverImage.large

                const addAction = `afm_1_1_${ctx.from?.id}_${animeId}`.slice(0, 63)
                const buttons = media.nextAiringEpisode?.airingAt ? [
                    [Markup.button.callback('Add to my list', addAction)],
                    [Markup.button.callback('Set Reminder (5min)', `a_scheduler:${animeId}:${dayjs(media.nextAiringEpisode.airingAt * 1000).subtract(5, 'minutes').valueOf()}:${ctx.from?.id}`)],
                    [Markup.button.callback('Set Reminder (30min)', `a_scheduler:${animeId}:${dayjs(media.nextAiringEpisode.airingAt * 1000).subtract(30, 'minutes').valueOf()}:${ctx.from?.id}`)]
                ] : [[Markup.button.callback('Add to my list', addAction)]]
                const keyboard = Markup.inlineKeyboard(buttons)

                !ctx.callbackQuery.inline_message_id
                    ? ctx.replyWithPhoto(cover, {
                        parse_mode: 'HTML',
                        caption: `${caption.slice(0, 1020)}</i>`,
                        ...keyboard
                    }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
                    : ctx.editMessageText(`${caption.slice(0, 4090)}</i>`, { parse_mode: "HTML" }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
            }
            else {
                ctx.replyWithHTML('Error. No anime found.')
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

anime.command('animebd', async (ctx) => {
    try {
        const results = await getIsBirthdayCharacters()
        const characters = results.Page?.characters

        if (characters && characters.length > 0) {
            const buttons = []
            for (const char of characters)
                buttons.push([Markup.button.callback(char.name.full ?? 'full name error', `getCharacter${char.id}`)])

            const keyboard = Markup.inlineKeyboard(buttons)
            const text = 'Characters celebrating their birthday today\n'

            ctx.replyWithHTML(text, keyboard)
        }
    } catch (error) {
        logger.error(error)
    }
})

anime.command('character', async (ctx) => {
    const search = ctx.message.text.replace(/^\/character((@\w+)?\s+)?/i, '')
    if (search.length > 2) {
        try {
            const results = await getCharacters(search)
            const characters = results.Page?.characters
            const total = results.Page?.pageInfo?.total as number ?? 1
            const perPage = results.Page?.pageInfo?.perPage as number ?? 5

            if (characters && characters.length > 0) {
                const buttons = []
                for (const char of characters)
                    buttons.push([Markup.button.callback(char.name.full ?? 'full name error', `getCharacter${char.id}`)])

                buttons.push([
                    Markup.button.callback('⏭', `CharPage${2}-${search}`, total / perPage <= 1),
                ])

                const keyboard = Markup.inlineKeyboard(buttons)
                const text = `Results for <i>${search}</i>`

                ctx.replyWithHTML(text, keyboard)
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

anime.action(/CharPage\d+-/i, async (ctx) => {
    const pageString = ctx.callbackQuery.data?.match(/CharPage(\d+)/i)?.[1]
    const page = parseInt(pageString ?? '1')
    const search = ctx.callbackQuery.data?.replace(/CharPage\d+-/i, '')
    if (search && search.length > 2) {
        try {
            const results = await getCharacters(search, page)
            const characters = results.Page?.characters
            const total = results.Page?.pageInfo?.total as number ?? 1
            const perPage = results.Page?.pageInfo?.perPage as number ?? 5

            if (characters && characters.length > 0) {
                const buttons = []
                for (const char of characters)
                    buttons.push([Markup.button.callback(char.name.full ?? 'full name error', `getCharacter${char.id}`)])

                const showPrevBtn = page >= 2
                const showNextBtn = total / perPage > page

                const lastRow = []
                showPrevBtn && lastRow.push(Markup.button.callback('⏮', `CharPage${page - 1}-${search}`))
                showNextBtn && lastRow.push(Markup.button.callback('⏭', `CharPage${page + 1}-${search}`))

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

anime.action(/getCharacter/, async (ctx) => {
    const characterId = parseInt(ctx.callbackQuery.data?.replace('getCharacter', '') ?? '')
    if (!isNaN(characterId)) {
        // buscar en AniList
        try {
            const results = await getCharacter(characterId)
            const character = results.Character
            if (character) {
                const caption = `<a href="${character.siteUrl}">${character.name.full ?? 'Nombre'}</a> (${character.id})
      Age: ${character.age ?? 'n/a'}  Gender: ${character.gender ?? 'n/a'}
      
      <i>${character.description.replace(/<br>/g, '') ?? 'description n/a'}`

                const cover = character.image.large

                !ctx.callbackQuery.inline_message_id
                    ? ctx.replyWithPhoto(cover, {
                        parse_mode: 'HTML',
                        caption: `${caption.slice(0, 1020)}</i>`,
                    })
                    : ctx.editMessageText(`${caption.slice(0, 4090)}</i>`, { parse_mode: "HTML" })
            }
            else {
                ctx.replyWithHTML('Error. No character found.').catch(logger.error)
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

export default anime