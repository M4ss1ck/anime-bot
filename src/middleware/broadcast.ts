import { Composer } from "grammy";
import { prisma } from "../db/prisma.js";
import { logger } from "../logger/index.js"

const adminID = process.env.ADMIN_ID ?? '123'

const broadcast = new Composer();

broadcast.filter(ctx => ctx.from?.id === Number(adminID)).command('send', async ctx => {
    const text = (ctx.msg?.text ?? '').replace(/^\/send(@\w+)?\s+/i, '')
    const users = await prisma.user.findMany({})
    for (const user of users) {
        await ctx.api.sendMessage(Number(user.id), text).catch(e => {
            logger.error(e)
            // TODO: review if users should be deleted in case of errors
            // or if status should be added
        })
    }
})

export default broadcast
