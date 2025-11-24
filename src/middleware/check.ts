import { Composer } from 'telegraf'
import { checkNewSeasons, checkNewNovelReleases } from './notifications.js'
import { logger } from '../logger/index.js'

const check = new Composer()

// Simple in-memory rate limiter
const rateLimit = new Map<string, number>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes

export const handleCheck = async (ctx: any) => {
  const userId = ctx.from.id.toString()
  const now = Date.now()

  if (rateLimit.has(userId)) {
    const lastCheck = rateLimit.get(userId) || 0
    if (now - lastCheck < RATE_LIMIT_WINDOW) {
      const remainingTime = Math.ceil((RATE_LIMIT_WINDOW - (now - lastCheck)) / 60000)
      return ctx.reply(`Please wait ${remainingTime} minutes before checking again.`)
    }
  }

  rateLimit.set(userId, now)

  await ctx.reply('Checking for updates... This might take a moment.')

  try {
    // Run checks for this user
    // We can run them in parallel
    await Promise.all([
      checkNewSeasons(ctx.telegram as any, undefined, userId),
      checkNewNovelReleases(ctx.telegram as any, undefined, userId)
    ])

    // Note: The check functions send notifications directly if updates are found.
    // We could modify them to return a count, but for now, let's just confirm completion.
    // Since we don't know if notifications were sent (without refactoring return values),
    // we can just say "Check complete."

    await ctx.reply('Check complete. If any updates were found, you should have received a notification.')

  } catch (error) {
    logger.error(`Error in /check command for user ${userId}: ${error}`)
    await ctx.reply('An error occurred while checking for updates.')
  }
}

check.command('check', handleCheck)

export default check
