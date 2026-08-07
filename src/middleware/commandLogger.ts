import { Composer } from 'grammy'
import { logger as log } from '../logger/index.js'
import { trackCommand } from '../metrics/command-usage.js'

const logger = new Composer()

logger.use(async (ctx, next) => {
    try {
        let messageText = `[${ctx.from?.id.toString() ?? 'n/a'}] `
        if (ctx.message?.text && ctx.message.text.startsWith('/')) {
            messageText += `[command] ${ctx.message.text}`
            log.info(messageText)
            // "/notify_on@mybot monday" -> "notify_on"
            const command = ctx.message.text.slice(1).split(/[\s@]/)[0]?.toLowerCase()
            if (command) trackCommand(command)
        } else if (ctx.callbackQuery?.data) {
            messageText += `[action] ${ctx.callbackQuery.data}`
            log.info(messageText)
        } else if (ctx.inlineQuery?.query) {
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
