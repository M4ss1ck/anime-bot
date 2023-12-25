import { Composer } from "telegraf";
import { prisma } from "../db/prisma.js";
import { logger } from "../logger/index.js"

const adminID = process.env.ADMIN_ID ?? '123'

const broadcast = new Composer();

broadcast.command('send', Composer.acl(Number(adminID), async ctx => {
    const text = ctx.message.text.replace(/^\/send(@\w+)?\s+/i, '')
    const users = await prisma.user.findMany({})
    for (const user of users) {
        await ctx.telegram.sendMessage(Number(user.id), text).catch(e => {
            logger.error(e)
            // TODO: review if users should be deleted in case of errors
            // or if status should be added
        })
    }
}))

export default broadcast