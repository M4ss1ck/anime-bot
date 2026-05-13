import { Composer } from "grammy"

const ping = new Composer()

ping.command('ping', async (ctx) => {
    const botUsername = ctx.me.username
    const messageTime = ctx.msg?.date ?? 0
    const delay = Math.round(Date.now() / 1000) - messageTime
    return ctx.reply(`[@${botUsername}] says Pong! 🏓\nTime: ${delay}ms`)
})

export default ping
