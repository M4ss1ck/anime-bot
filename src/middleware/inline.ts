import { Composer, InlineKeyboard } from 'grammy'
import { logger } from '../logger/index.js'

const inline = new Composer()

inline.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query
    const userId = ctx.inlineQuery.from.id
    const response = [
        {
            type: 'article' as const,
            id: `Search ${query}`,
            title: `Search ${query}`,
            description: 'You can choose between internal DB or AniList API',
            input_message_content: {
                message_text: `Searching "${query}"`,
            },
            reply_markup: new InlineKeyboard()
                .text('Search anime in AniList', `AnimPage1-${encodeURIComponent(query)}`).row()
                .text('Search character in AniList', `CharPage1-${encodeURIComponent(query)}`).row()
                .text('Search in my anime list', `Local_1_${userId}_${encodeURIComponent(query)}`).row()
                .text('Show full list', `myanime_1_${userId}`),
        },
    ]

    return ctx
        .answerInlineQuery(response, { cache_time: 5, is_personal: true })
        .catch(e => logger.error('ERROR WITH INLINE QUERY\n', e))
})

inline.on('chosen_inline_result', ({ chosenInlineResult }) => {
    logger.success('Chosen inline result:\n', chosenInlineResult)
})

export default inline