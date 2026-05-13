import type { DetailProviderId, MediaDetails } from '../details-service/types.js'
import { summarizeDetails, toReadingUpdate } from '../details-service/index.js'
import { escapeHtml } from '../utils/index.js'

const MAX_CALLBACK_DATA_LENGTH = 64

const providerLabels: Record<DetailProviderId, string> = {
    anilist: 'ANILIST',
    kitsu: 'KITSU',
    'google-books': 'GOOGLE BOOKS',
    'open-library': 'OPEN LIBRARY',
    hardcover: 'HARDCOVER',
}

const providerAliases: Record<DetailProviderId, string> = {
    anilist: 'al',
    kitsu: 'ki',
    'google-books': 'gb',
    'open-library': 'ol',
    hardcover: 'hc',
}

const providerByAlias: Record<string, DetailProviderId> = Object.fromEntries(
    Object.entries(providerAliases).map(([provider, alias]) => [alias, provider]),
) as Record<string, DetailProviderId>

export type ReadingDetailsRef = {
    provider: DetailProviderId
    id: string
}

export function readingResultButtonLabel(details: Pick<MediaDetails, 'provider' | 'title'>) {
    const provider = providerLabels[details.provider] ?? details.provider.toUpperCase()
    const maxTitleLength = 48 - provider.length
    const title = details.title.length > maxTitleLength ? `${details.title.slice(0, Math.max(10, maxTitleLength - 3))}...` : details.title

    return `[${provider}] ${title}`
}

export function readingDetailsPreviewText(details: MediaDetails) {
    return `<b>Preview reading series</b>\n\n${summarizeDetails(details)}`
}

export function buildReadingDetailsCallback(prefix: string, details: Pick<MediaDetails, 'provider' | 'id'>) {
    const alias = providerAliases[details.provider]
    const callbackData = `${prefix}_${alias}_${encodeURIComponent(details.id)}`

    return callbackData.length <= MAX_CALLBACK_DATA_LENGTH ? callbackData : null
}

export function parseReadingDetailsCallback(data: string, prefix: string): ReadingDetailsRef | null {
    const value = data.replace(new RegExp(`^${prefix}_`, 'i'), '')
    const [alias, ...encodedIdParts] = value.split('_')
    const provider = providerByAlias[alias]
    const encodedId = encodedIdParts.join('_')

    if (!provider || !encodedId) return null

    return {
        provider,
        id: decodeURIComponent(encodedId),
    }
}

export function buildAddReadingCallback(userId: string, details: Pick<MediaDetails, 'provider' | 'id'>) {
    return buildReadingDetailsCallback(`nfm_${userId}`, details)
}

export function buildReadingResultButton(details: MediaDetails): { text: string, callback_data: string } | null {
    const callbackData = buildReadingDetailsCallback('nvd', details)
    if (!callbackData) return null

    return {
        text: readingResultButtonLabel(details),
        callback_data: callbackData,
    }
}

export function readingSeriesName(details: MediaDetails) {
    return details.title.trim()
}

export function readingSeriesNote(details: MediaDetails) {
    const lines = [
        `${details.title}${details.provider === 'anilist' && details.anilistId ? ` (${details.anilistId})` : ''}`,
        details.alternateTitle && details.alternateTitle !== details.title ? details.alternateTitle : null,
        details.authors?.length ? `Authors: ${details.authors.join(', ')}` : null,
        details.genres?.length ? `Genres: ${details.genres.join(', ')}` : null,
        details.totalVolumes ? `Volumes: ${details.totalVolumes}` : null,
        details.totalChapters ? `Chapters: ${details.totalChapters}` : null,
        details.status ? `Status: ${details.status}` : null,
        details.source ? `Source: ${details.source}` : null,
        `Provider: ${details.providerLabel}`,
        details.detailsUrl ? `Details: ${details.detailsUrl}` : null,
    ]

    return lines.filter((line): line is string => Boolean(line)).join('\n')
}

export function toNovelCreateData(details: MediaDetails, userId: string) {
    return {
        name: readingSeriesName(details),
        volume: 1,
        note: readingSeriesNote(details),
        releasing: /releasing|current|ongoing/i.test(details.status ?? ''),
        ...toReadingUpdate(details),
        user: {
            connectOrCreate: {
                where: { id: userId },
                create: { id: userId },
            },
        },
    }
}

export function toNovelUpdateData(details: MediaDetails) {
    return {
        note: readingSeriesNote(details),
        releasing: /releasing|current|ongoing/i.test(details.status ?? ''),
        ...toReadingUpdate(details),
    }
}

export function noAddCallbackText(details: MediaDetails) {
    return `Could not create an add button for <b>${escapeHtml(details.title)}</b>. The provider id is too long for Telegram callback data.`
}

export function parseAddReadingCallback(data: string): { userId: string, provider: DetailProviderId, id: string } | null {
    const parts = data.replace(/^nfm_/i, '').split('_')
    const [userId, alias, ...encodedIdParts] = parts
    const provider = providerByAlias[alias]
    const encodedId = encodedIdParts.join('_')

    if (!userId || !provider || !encodedId) return null

    return {
        userId,
        provider,
        id: decodeURIComponent(encodedId),
    }
}
