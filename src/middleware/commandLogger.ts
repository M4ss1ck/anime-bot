import { Composer } from 'telegraf'
import { callbackQuery, message } from "telegraf/filters"
import { logger as log } from '../logger'

const logger = new Composer()

logger.use(async (ctx, next) => {
    try {
        let messageText = `[${ctx.from?.id.toString() ?? 'n/a'}] `
        if (ctx.has(message('text')) && ctx.message.text.startsWith('/')) {
            messageText += `[command] ${ctx.message.text}`
            log.info(messageText)
        } else if (ctx.has(callbackQuery('data'))) {
            messageText += `[action] ${ctx.callbackQuery.data}`
            log.info(messageText)
        } else if ('inlineQuery' in ctx && ctx.inlineQuery?.query) {
            messageText += `[inline] ${ctx.inlineQuery.query}`
            log.info(messageText)
        }
    } catch (error) {
        log.info('Error in logger middleware')
        log.error(error)
    }
    return next()
})

export default logger
