import type { Api } from "grammy"
import { prisma } from "../db/prisma.js"
import { getAnimeRelations, getNovelRelations } from "../anilist-service/index.js"
import { logger } from "../logger/index.js"
import { escapeHtml } from "../utils/index.js"
import { getSeriesBooks } from "../details-service/providers/hardcover.js"
import { formatNewVolumesMessage, formatVolumeReport, pendingVolumes } from "./volume-releases.js"
import type { PendingVolume } from "./volume-releases.js"
import type { Novel } from "../generated/prisma/client.js"

export const checkNewSeasons = async (api: Api, fetcher = getAnimeRelations, targetUserId?: string) => {
  logger.info(`Checking for new seasons... ${targetUserId ? `(Target: ${targetUserId})` : ''}`)
  try {
    // Get all unique anilistIds from the database
    // If targetUserId is provided, only get animes for that user
    const whereClause: { anilistId: { not: null }; userId?: string } = {
      anilistId: {
        not: null
      }
    }

    if (targetUserId) {
      whereClause.userId = targetUserId
    }

    const animes = await prisma.anime.findMany({
      where: whereClause,
      select: {
        anilistId: true
      },
      distinct: ['anilistId']
    })

    for (const animeRecord of animes) {
      if (!animeRecord.anilistId) continue

      const animeData = await fetcher(animeRecord.anilistId)
      const relations = animeData?.Media?.relations?.edges

      if (relations) {
        for (const edge of relations) {
          if (edge.relationType === 'SEQUEL' && edge.node.type === 'ANIME') {
            const sequel = edge.node
            // Check if sequel is airing or about to air (e.g. has a next episode or status is RELEASING/NOT_YET_RELEASED)
            // We can be more specific: if it has a next airing episode, or if it started recently.
            // For now, let's notify if it's RELEASING or NOT_YET_RELEASED and has a title.

            if (sequel.status === 'RELEASING' || sequel.status === 'NOT_YET_RELEASED') {
              // Find users who track the original anime
              const userWhereClause: { anilistId: number | null; userId?: string } = {
                anilistId: animeRecord.anilistId
              }

              if (targetUserId) {
                userWhereClause.userId = targetUserId
              }

              const usersTrackingOriginal = await prisma.anime.findMany({
                where: userWhereClause,
                select: {
                  userId: true
                }
              })

              for (const user of usersTrackingOriginal) {
                // Check if user already tracks the sequel
                const userTracksSequel = await prisma.anime.findFirst({
                  where: {
                    userId: user.userId,
                    anilistId: sequel.id
                  }
                })

                if (!userTracksSequel) {
                  // Check if we already notified this user about this sequel
                  const alreadyNotified = await prisma.notificationHistory.findUnique({
                    where: {
                      userId_animeId: {
                        userId: user.userId,
                        animeId: sequel.id
                      }
                    }
                  })

                  if (!alreadyNotified) {
                    // Send notification
                    const title = sequel.title.english || sequel.title.romaji || sequel.title.native
                    const message = `📢 <b>New Season Alert!</b>\n\nA sequel to an anime you are watching is available or coming soon:\n\n<b>${escapeHtml(title)}</b>\n\nDo you want to add it to your list?`

                    try {
                      await api.sendMessage(user.userId, message, {
                        parse_mode: 'HTML'
                      })

                      // Record notification
                      await prisma.notificationHistory.create({
                        data: {
                          userId: user.userId,
                          animeId: sequel.id
                        }
                      })
                      logger.info(`Notified user ${user.userId} about sequel ${sequel.id}`)
                    } catch (error) {
                      logger.error(`Failed to notify user ${user.userId}: ${error}`)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error checking new seasons: ${error}`)
  }
}

export const checkNewNovelReleases = async (api: Api, fetcher = getNovelRelations, targetUserId?: string) => {
  logger.info(`Checking for new novel releases... ${targetUserId ? `(Target: ${targetUserId})` : ''}`)
  try {
    const whereClause: { anilistId: { not: null }; userId?: string } = {
      anilistId: {
        not: null
      }
    }

    if (targetUserId) {
      whereClause.userId = targetUserId
    }

    const novels = await prisma.novel.findMany({
      where: whereClause,
      select: {
        anilistId: true
      },
      distinct: ['anilistId']
    })

    for (const novelRecord of novels) {
      if (!novelRecord.anilistId) continue

      const novelData = await fetcher(novelRecord.anilistId)
      const relations = novelData?.Media?.relations?.edges

      if (relations) {
        for (const edge of relations) {
          // Check for sequels or side stories that are novels
          if ((edge.relationType === 'SEQUEL' || edge.relationType === 'SIDE_STORY') && edge.node.type === 'MANGA') {
            const sequel = edge.node

            // For novels, status might be RELEASING even if it's just a new volume.
            // But here we are looking for *new entries* in AniList (e.g. Part 2, Sequel).
            if (sequel.status === 'RELEASING' || sequel.status === 'NOT_YET_RELEASED') {
              const userWhereClause: { anilistId: number | null; userId?: string } = {
                anilistId: novelRecord.anilistId
              }

              if (targetUserId) {
                userWhereClause.userId = targetUserId
              }

              const usersTrackingOriginal = await prisma.novel.findMany({
                where: userWhereClause,
                select: {
                  userId: true
                }
              })

              for (const user of usersTrackingOriginal) {
                const userTracksSequel = await prisma.novel.findFirst({
                  where: {
                    userId: user.userId,
                    anilistId: sequel.id
                  }
                })

                if (!userTracksSequel) {
                  const alreadyNotified = await prisma.notificationHistory.findUnique({
                    where: {
                      userId_animeId: { // We reuse the same table, animeId stores AniList ID (which is unique across anime/manga)
                        userId: user.userId,
                        animeId: sequel.id
                      }
                    }
                  })

                  if (!alreadyNotified) {
                    const title = sequel.title.english || sequel.title.romaji || sequel.title.native
                    const message = `📚 <b>New Novel Alert!</b>\n\nA sequel/related novel to one you are reading is available or coming soon:\n\n<b>${escapeHtml(title)}</b>\n\nDo you want to add it to your list?`

                    try {
                      await api.sendMessage(user.userId, message, {
                        parse_mode: 'HTML'
                      })

                      await prisma.notificationHistory.create({
                        data: {
                          userId: user.userId,
                          animeId: sequel.id
                        }
                      })
                      logger.info(`Notified user ${user.userId} about novel sequel ${sequel.id}`)
                    } catch (error) {
                      logger.error(`Failed to notify user ${user.userId}: ${error}`)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error checking new novel releases: ${error}`)
  }
}

export type PendingVolumeEntry = {
  novel: Novel
  trackedVolume: number
  pending: PendingVolume[]
  notifiedPositions: number[]
}

// Reports state only: every volume above the user's read progress, regardless of what has
// already been announced. Consumers decide whether to dedup against notifiedPositions.
export const collectPendingVolumes = async (fetcher = getSeriesBooks, targetUserId?: string): Promise<PendingVolumeEntry[]> => {
  // Errors are not swallowed here: a broken check must reach the caller so /check
  // can report it instead of claiming success.
  // Only series with saved Hardcover details can be resolved to a book list
  const novels = await prisma.novel.findMany({
    where: {
      detailsProvider: 'hardcover',
      detailsId: { not: null },
      volume: { not: null },
      ...(targetUserId ? { userId: targetUserId } : {})
    }
  })

  const entries: PendingVolumeEntry[] = []

  for (const novel of novels) {
    if (!novel.detailsId || novel.volume === null) continue

    const books = await fetcher(novel.detailsId)
    if (books.length < 1) {
      logger.info(`No Hardcover books found for ${novel.name} (series ${novel.detailsId})`)
      continue
    }

    const notified = await prisma.volumeNotification.findMany({
      where: {
        userId: novel.userId,
        novelId: novel.id
      },
      select: {
        volume: true
      }
    })

    entries.push({
      novel,
      trackedVolume: novel.volume,
      pending: pendingVolumes(novel.volume, books, []),
      notifiedPositions: notified.map(entry => entry.volume)
    })
  }

  return entries
}

export const recordNotifiedVolumes = async (userId: string, novelId: number, volumes: PendingVolume[]) => {
  if (volumes.length < 1) return

  await prisma.volumeNotification.createMany({
    data: volumes.map(volume => ({
      userId,
      novelId,
      volume: volume.position
    }))
  })
}

export const checkNewVolumes = async (api: Api, fetcher = getSeriesBooks, targetUserId?: string) => {
  logger.info(`Checking for new volumes... ${targetUserId ? `(Target: ${targetUserId})` : ''}`)

  const entries = await collectPendingVolumes(fetcher, targetUserId)

  let notifiedCount = 0

  for (const { novel, trackedVolume, pending, notifiedPositions } of entries) {
    // The scheduled push only announces each volume once.
    const unnotified = pending.filter(volume => !notifiedPositions.includes(volume.position))
    if (unnotified.length < 1) continue

    const message = formatNewVolumesMessage({
      name: novel.name,
      trackedVolume,
      volumes: unnotified,
      detailsUrl: novel.detailsUrl
    })

    try {
      await api.sendMessage(novel.userId, message, {
        parse_mode: 'HTML'
      })

      await recordNotifiedVolumes(novel.userId, novel.id, unnotified)
      notifiedCount += unnotified.length
      logger.info(`Notified user ${novel.userId} about ${unnotified.length} new volume(s) of ${novel.name}`)
    } catch (error) {
      logger.error(`Failed to notify user ${novel.userId} about new volumes of ${novel.name}: ${error}`)
    }
  }

  return notifiedCount
}

// The /check pull: reports current state against read progress, ignoring what the
// scheduled push has already announced.
export const reportPendingVolumes = async (targetUserId: string, fetcher = getSeriesBooks) => {
  logger.info(`Reporting pending volumes... (Target: ${targetUserId})`)

  const entries = await collectPendingVolumes(fetcher, targetUserId)

  const { messages, summary } = formatVolumeReport(entries.map(entry => ({
    name: entry.novel.name,
    trackedVolume: entry.trackedVolume,
    pending: entry.pending,
    detailsUrl: entry.novel.detailsUrl
  })))

  return { messages, summary, entries }
}

// Called after /check has delivered its report, so the scheduler will not push a
// duplicate ping about volumes the user just saw on demand.
export const markVolumesNotified = async (entries: PendingVolumeEntry[]) => {
  for (const { novel, pending, notifiedPositions } of entries) {
    const unrecorded = pending.filter(volume => !notifiedPositions.includes(volume.position))
    await recordNotifiedVolumes(novel.userId, novel.id, unrecorded)
  }
}
