import { Composer } from 'grammy'
import type { Context } from 'grammy'
import { checkNewSeasons, checkNewNovelReleases, checkNewVolumes } from './notifications.js'
import { logger } from '../logger/index.js'

const check = new Composer()

// Simple in-memory rate limiter
const rateLimit = new Map<string, number>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes

export const handleCheck = async (ctx: Context) => {
  const userId = ctx.from?.id?.toString() ?? ''
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
    const [, , newVolumes] = await Promise.all([
      checkNewSeasons(ctx.api, undefined, userId),
      checkNewNovelReleases(ctx.api, undefined, userId),
      checkNewVolumes(ctx.api, undefined, userId)
    ])

    // The season/novel checks still notify directly without reporting a count.
    await ctx.reply(`Check complete. ${newVolumes > 0 ? `Found ${newVolumes} new volume(s).` : 'No new volumes for your series.'} Any other update was sent as a separate notification.`)

  } catch (error) {
    logger.error(`Error in /check command for user ${userId}: ${error}`)
    await ctx.reply('An error occurred while checking for updates.')
  }
}

check.command('check', handleCheck)

export default check
