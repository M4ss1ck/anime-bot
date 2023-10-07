import { Composer } from "telegraf"

const ping = new Composer()

ping.command('ping', async ctx => {
    const botUsername = ctx.me
    const messageTime = ctx.message.date
    const delay = Math.round(Date.now() / 1000) - messageTime
    ctx.reply(`[@${botUsername}] says Pong! 🏓\nTime: ${delay}ms`)
})

export default ping