import { Composer, Markup } from "telegraf"
import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"

import * as fs from 'fs/promises'

const adminID = process.env.ADMIN_ID ?? '123'

const admin = new Composer()

admin.command('users', Composer.acl(Number(adminID), async ctx => {
    const fileName = `${Date.now()}_userlist.txt`
    const users = await prisma.user.findMany({
        include: {
            animes: true,
        }
    })

    const animelist = users.map(user => `${user.id} (${user.animes.length} anime)`).join('\n')

    await fs.writeFile(fileName, animelist)

    await ctx.replyWithDocument({ source: fileName, filename: fileName }, { caption: 'List of users' })

    await fs.unlink(fileName)
}))

export default admin