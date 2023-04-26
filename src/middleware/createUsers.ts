import { Composer } from 'telegraf'
import { prisma } from '../db/prisma.js'

const users = new Composer()

users.use(async (ctx, next) => {
    if (ctx.from) {
        await prisma.user.upsert({
            where: {
                id: ctx.from.id.toString(),
            },
            update: {},
            create: {
                id: ctx.from.id.toString(),
            },
        }).catch(e => console.log('Error with upsert creating user\n', e))
    }
    return next()
})

export default users