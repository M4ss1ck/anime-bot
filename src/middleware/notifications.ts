import { Telegraf } from "telegraf"
import { prisma } from "../db/prisma.js"
import { getAnimeRelations, getNovelRelations } from "../anilist-service/index.js"
import { logger } from "../logger/index.js"
import { escape } from "../utils/index.js"

export const checkNewSeasons = async (bot: Telegraf, fetcher = getAnimeRelations) => {
  logger.info('Checking for new seasons...')
  try {
    // Get all unique anilistIds from the database
    const animes = await prisma.anime.findMany({
      where: {
        anilistId: {
          not: null
        }
      },
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
              const usersTrackingOriginal = await prisma.anime.findMany({
                where: {
                  anilistId: animeRecord.anilistId
                },
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
                    const message = `📢 <b>New Season Alert!</b>\n\nA sequel to an anime you are watching is available or coming soon:\n\n<b>${escape(title)}</b>\n\nDo you want to add it to your list?`

                    try {
                      await bot.telegram.sendMessage(user.userId, message, {
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

export const checkNewNovelReleases = async (bot: Telegraf, fetcher = getNovelRelations) => {
  logger.info('Checking for new novel releases...')
  try {
    const novels = await prisma.novel.findMany({
      where: {
        anilistId: {
          not: null
        }
      },
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

              const usersTrackingOriginal = await prisma.novel.findMany({
                where: {
                  anilistId: novelRecord.anilistId
                },
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
                    const message = `📚 <b>New Novel Alert!</b>\n\nA sequel/related novel to one you are reading is available or coming soon:\n\n<b>${escape(title)}</b>\n\nDo you want to add it to your list?`

                    try {
                      await bot.telegram.sendMessage(user.userId, message, {
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
