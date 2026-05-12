import { Bot } from 'grammy'

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

const bot = new Bot(botToken)

try {
    await bot.api.setWebhook(webhookUrl)
    console.log(`Webhook set successfully: ${webhookUrl}`)
} catch (error) {
    console.error('Failed to set webhook:', error)
    process.exit(1)
} finally {
    await bot.stop()
    process.exit(0)
}
