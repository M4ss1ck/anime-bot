import { Composer, InlineKeyboard } from 'grammy'
import { logger } from '../logger/index.js'
import dayjs from 'dayjs'
import { getAnime, getAnimes, getCharacter, getCharacters, getIsBirthdayCharacters } from '../anilist-service/index.js'

import { convertMsToRelativeTime, escapeHtml } from '../utils/index.js'

const anime = new Composer()

anime.command('anime', async (ctx) => {
    const search = (ctx.msg?.text ?? '').replace(/^\/anime((@\w+)?\s+)?/i, '')
    if (search.length > 2) {
        // buscar en AniList
        try {
            const results = await getAnimes(search)
            if (!results) return ctx.reply('Error. No anime found.', { parse_mode: 'HTML' })
            const media = results.Page?.media
            if (media && media.length > 0) {
                const keyboard = new InlineKeyboard()
                for (const a of media)
                    keyboard.text(a.title.romaji ?? 'placeholder text', `getAnime${a.id}`).row()

                keyboard.text('⏭', `AnimPage${2}-${encodeURIComponent(search)}`)

                const text = `Results for <b>${escapeHtml(search)}</b>`

                return ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard })
            }
            else {
                return ctx.reply('Error. No anime found.', { parse_mode: 'HTML' })
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

anime.callbackQuery(/AnimPage\d+-/i, async (ctx) => {
    ctx.answerCallbackQuery().catch(logger.error)
    const pageString = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data?.match(/AnimPage(\d+)/i)?.[1] : null
    const page = parseInt(pageString ?? '1')
    const search = 'data' in ctx.callbackQuery ? decodeURIComponent(ctx.callbackQuery.data?.replace(/AnimPage\d+-/i, '') ?? '') : ''
    if (search && search.length > 2) {
        // buscar en AniList
        try {
            const results = await getAnimes(search, page)
            if (!results) return logger.error('No results for ' + search + ' in page ' + page)
            const media = results.Page?.media
            const total = results.Page?.pageInfo?.total as number ?? 1
            const perPage = results.Page?.pageInfo?.perPage as number ?? 5
            if (media && media.length > 0) {
                const keyboard = new InlineKeyboard()
                for (const a of media)
                    keyboard.text(a.title.romaji ?? 'placeholder text', `getAnime${a.id}`).row()

                const showPrevBtn = page >= 2
                const showNextBtn = total / perPage > page

                if (showPrevBtn) keyboard.text('⏮', `AnimPage${page - 1}-${encodeURIComponent(search)}`)
                if (showNextBtn) keyboard.text('⏭', `AnimPage${page + 1}-${encodeURIComponent(search)}`)

                return ctx.editMessageReplyMarkup({ reply_markup: keyboard })
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

anime.callbackQuery(/getAnime/, async (ctx) => {
    ctx.answerCallbackQuery().catch(logger.error)
    const animeId = parseInt('data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace('getAnime', '') : '')
    if (!isNaN(animeId)) {
        // buscar en AniList
        try {
            const results = await getAnime(animeId)
            if (!results) return ctx.reply('Error. No anime found.', { parse_mode: 'HTML' }).catch(logger.error)
            const media = results.Media
            if (media) {
                const caption = `<b>${media.title.romaji ?? 'Title'}</b> (${media.id})\n<i>${escapeHtml(media.title.english ?? '')}</i>\nGenres: ${media.genres ? media.genres.join(', ') : 'n/a'}\nHashtag: ${media.hashtag ?? 'n/a'}\nYear: ${media.seasonYear ?? 'n/a'}  Episodes: ${media.episodes ?? 'n/a'}\n${media.nextAiringEpisode ? 'Next airing episode: ' + new Date(Math.floor(media.nextAiringEpisode.airingAt * 1000)).toLocaleString('en-US') + ' <i>(in ' + convertMsToRelativeTime(media.nextAiringEpisode.airingAt * 1000 - Date.now()) + ')</i> ' : '<i>no airing info available</i>'}\n\n<i>${media.description ? escapeHtml(media.description) : 'description n/a'}`

                const cover = media.coverImage.large

                const addAction = `afm_1_1_${ctx.from?.id}_${animeId}`.slice(0, 63)
                const keyboard = new InlineKeyboard()
                keyboard.text('Add to my list', addAction).row()
                if (media.nextAiringEpisode?.airingAt) {
                    keyboard.text('Set Reminder (5min)', `a_scheduler:${animeId}:${dayjs(media.nextAiringEpisode.airingAt * 1000).subtract(5, 'minutes').valueOf()}:${ctx.from?.id}`).row()
                    keyboard.text('Set Reminder (30min)', `a_scheduler:${animeId}:${dayjs(media.nextAiringEpisode.airingAt * 1000).subtract(30, 'minutes').valueOf()}:${ctx.from?.id}`)
                }

                return !ctx.callbackQuery.inline_message_id
                    ? ctx.replyWithPhoto(cover, {
                        parse_mode: 'HTML',
                        caption: `${caption.slice(0, 1020)}</i>`,
                        reply_markup: keyboard
                    }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
                    : ctx.editMessageText(`${caption.slice(0, 4090)}</i>`, { parse_mode: "HTML" }).catch(() => ctx.reply('Parsing error. Contact bot owner.'))
            }
            else {
                return ctx.reply('Error. No anime found.', { parse_mode: 'HTML' }).catch(logger.error)
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

anime.command('animebd', async (ctx) => {
    try {
        const results = await getIsBirthdayCharacters()
        if (!results) return ctx.reply('Error. No character found.', { parse_mode: 'HTML' })
        const characters = results.Page?.characters

        if (characters && characters.length > 0) {
            const keyboard = new InlineKeyboard()
            for (const char of characters)
                keyboard.text(char.name.full ?? 'full name error', `getCharacter${char.id}`).row()

            const text = 'Characters celebrating their birthday today\n'

            return ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard })
        }
    } catch (error) {
        logger.error(error)
    }
})

anime.command('character', async (ctx) => {
    const search = (ctx.msg?.text ?? '').replace(/^\/character((@\w+)?\s+)?/i, '')
    if (search.length > 2) {
        try {
            const results = await getCharacters(search)
            if (!results) return ctx.reply('Error. No character found.', { parse_mode: 'HTML' })
            const characters = results.Page?.characters

            if (characters && characters.length > 0) {
                const keyboard = new InlineKeyboard()
                for (const char of characters)
                    keyboard.text(char.name.full ?? 'full name error', `getCharacter${char.id}`).row()

                keyboard.text('⏭', `CharPage${2}-${encodeURIComponent(search)}`)

                const text = `Results for <i>${escapeHtml(search)}</i>`

                return ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard })
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

anime.callbackQuery(/CharPage\d+-/i, async (ctx) => {
    ctx.answerCallbackQuery().catch(logger.error)
    const pageString = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data?.match(/CharPage(\d+)/i)?.[1] : null
    const page = parseInt(pageString ?? '1')
    const search = 'data' in ctx.callbackQuery ? decodeURIComponent(ctx.callbackQuery.data?.replace(/CharPage\d+-/i, '') ?? '') : ''
    if (search && search.length > 2) {
        try {
            const results = await getCharacters(search, page)
            if (!results) return logger.error('Error in CharPage for ' + search)
            const characters = results.Page?.characters
            const total = results.Page?.pageInfo?.total as number ?? 1
            const perPage = results.Page?.pageInfo?.perPage as number ?? 5

            if (characters && characters.length > 0) {
                const keyboard = new InlineKeyboard()
                for (const char of characters)
                    keyboard.text(char.name.full ?? 'full name error', `getCharacter${char.id}`).row()

                const showPrevBtn = page >= 2
                const showNextBtn = total / perPage > page

                if (showPrevBtn) keyboard.text('⏮', `CharPage${page - 1}-${encodeURIComponent(search)}`)
                if (showNextBtn) keyboard.text('⏭', `CharPage${page + 1}-${encodeURIComponent(search)}`)

                return ctx.editMessageReplyMarkup({ reply_markup: keyboard })
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

anime.callbackQuery(/getCharacter/, async (ctx) => {
    ctx.answerCallbackQuery().catch(logger.error)
    const characterId = parseInt('data' in ctx.callbackQuery ? ctx.callbackQuery.data?.replace('getCharacter', '') : '')
    if (!isNaN(characterId)) {
        // buscar en AniList
        try {
            const results = await getCharacter(characterId)
            if (!results) return ctx.reply('Error. No character found.', { parse_mode: 'HTML' }).catch(logger.error)
            const character = results.Character
            if (character) {
                const caption = `<a href="${character.siteUrl}">${character.name.full ?? 'Nombre'}</a> (${character.id})\nAge: ${character.age ?? 'n/a'}  Gender: ${character.gender ?? 'n/a'}\n\n<i>${character.description ? escapeHtml(character.description) : 'description n/a'}`

                const cover = character.image.large

                return !ctx.callbackQuery.inline_message_id
                    ? ctx.replyWithPhoto(cover, {
                        parse_mode: 'HTML',
                        caption: `${caption.slice(0, 1020)}</i>`,
                    })
                    : ctx.editMessageText(`${caption.slice(0, 4090)}</i>`, { parse_mode: "HTML" })
            }
            else {
                return ctx.reply('Error. No character found.', { parse_mode: 'HTML' }).catch(logger.error)
            }
        } catch (error) {
            logger.error(error)
        }
    }
})

export default anime
