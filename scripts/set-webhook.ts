import { Telegraf } from 'telegraf'

const botToken = process.env.BOT_TOKEN
const webhookDomain = process.env.WEBHOOK_DOMAIN

if (!botToken) {
    console.error('Error: BOT_TOKEN is not set')
    process.exit(1)
}

if (!webhookDomain) {
    console.error('Error: WEBHOOK_DOMAIN is not set')
    process.exit(1)
}

const webhookPath = `/webhook/${botToken}`
const webhookUrl = `${webhookDomain.replace(/\/$/, '')}${webhookPath}`

const bot = new Telegraf(botToken)

try {
    await bot.telegram.setWebhook(webhookUrl)
    console.log(`Webhook set successfully: ${webhookUrl}`)
} catch (error) {
    console.error('Failed to set webhook:', error)
    process.exit(1)
} finally {
    bot.stop()
    process.exit(0)
}
