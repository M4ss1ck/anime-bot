import { Composer } from 'grammy'
import type { Context } from 'grammy'
import { checkNewSeasons, checkNewNovelReleases, markVolumesNotified, reportPendingVolumes } from './notifications.js'
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
    // Seasons and novel releases still notify directly, without reporting a count.
    // allSettled: a failing season or novel check must not cost the user their volume report.
    const [seasons, novels, volumes] = await Promise.allSettled([
      checkNewSeasons(ctx.api, undefined, userId),
      checkNewNovelReleases(ctx.api, undefined, userId),
      reportPendingVolumes(userId)
    ])

    if (seasons.status === 'rejected') {
      logger.error(`Season check failed for user ${userId}: ${seasons.reason}`)
    }

    if (novels.status === 'rejected') {
      logger.error(`Novel release check failed for user ${userId}: ${novels.reason}`)
    }

    if (volumes.status === 'rejected') {
      logger.error(`Volume report failed for user ${userId}: ${volumes.reason}`)
      await ctx.reply('An error occurred while checking for updates.')
      return
    }

    const volumeReport = volumes.value

    for (const message of volumeReport.messages) {
      await ctx.reply(message, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
    }

    try {
      await markVolumesNotified(volumeReport.entries)
    } catch (error) {
      logger.error(`Failed to record notified volumes for user ${userId}: ${error}`)
    }

    await ctx.reply(`${volumeReport.summary} Any other update was sent as a separate notification.`)

  } catch (error) {
    logger.error(`Error in /check command for user ${userId}: ${error}`)
    await ctx.reply('An error occurred while checking for updates.')
  }
}

check.command('check', handleCheck)

export default check
