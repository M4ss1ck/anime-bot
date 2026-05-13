import { anilistProvider } from './providers/anilist.js'
import { googleBooksProvider } from './providers/google-books.js'
import { hardcoverProvider } from './providers/hardcover.js'
import { kitsuProvider } from './providers/kitsu.js'
import type {
    AnimeDetailUpdate,
    DetailKind,
    DetailProviderId,
    MediaDetails,
    MediaDetailsProvider,
    ReadingDetailUpdate,
    SavedMediaRecord,
} from './types.js'
import { supportsKind } from './types.js'

export const detailProviders: MediaDetailsProvider[] = [
    anilistProvider,
    kitsuProvider,
    googleBooksProvider,
    hardcoverProvider,
]

export function getProvider(providerId: string): MediaDetailsProvider | undefined {
    return detailProviders.find(provider => provider.id === providerId)
}

export async function searchDetails(kind: DetailKind, query: string, limit = 5): Promise<MediaDetails[]> {
    const providers = detailProviders.filter(provider => supportsKind(provider, kind))
    const settled = await Promise.allSettled(providers.map(provider => provider.search({ kind, query, limit })))

    return dedupeDetails(settled.flatMap(result => result.status === 'fulfilled' ? result.value : []))
}

export async function getDetailsByProvider(kind: DetailKind, providerId: string, id: string): Promise<MediaDetails | null> {
    const provider = getProvider(providerId)
    if (!provider || !supportsKind(provider, kind)) return null

    return provider.getById({ kind, id })
}

export async function getBestDetails(kind: DetailKind, record: SavedMediaRecord): Promise<MediaDetails | null> {
    if (record.anilistId) {
        const anilistDetails = await anilistProvider.getById({ kind, id: String(record.anilistId) })
        if (anilistDetails) return anilistDetails
    }

    const results = await searchDetails(kind, record.name, 3)
    return results[0] ?? null
}

export function toAnimeUpdate(details: MediaDetails): AnimeDetailUpdate {
    return removeUndefined({
        anilistId: details.provider === 'anilist' ? details.anilistId : undefined,
        detailsProvider: details.provider,
        detailsId: details.id,
        detailsUrl: details.detailsUrl,
        coverImageUrl: details.coverImageUrl,
        status: details.status,
        genres: details.genres?.join(', '),
        description: details.description,
        totalEpisodes: details.totalEpisodes,
        streamingUrl: details.streamingUrl,
    })
}

export function toReadingUpdate(details: MediaDetails): ReadingDetailUpdate {
    return removeUndefined({
        anilistId: details.provider === 'anilist' ? details.anilistId : undefined,
        detailsProvider: details.provider,
        detailsId: details.id,
        detailsUrl: details.detailsUrl,
        coverImageUrl: details.coverImageUrl,
        status: details.status,
        genres: details.genres?.join(', '),
        description: details.description,
        totalVolumes: details.totalVolumes,
        totalChapters: details.totalChapters,
        authors: details.authors?.join(', '),
        source: details.source,
    })
}

export function encodeDetailsRef(kind: DetailKind, provider: DetailProviderId, id: string) {
    return `${kind}:${provider}:${encodeURIComponent(id)}`
}

export function decodeDetailsRef(ref: string) {
    const [kind, provider, encodedId] = ref.split(':')
    if ((kind !== 'anime' && kind !== 'reading') || !provider || !encodedId) return null

    return {
        kind,
        provider,
        id: decodeURIComponent(encodedId),
    }
}

export function summarizeDetails(details: MediaDetails) {
    const lines = [
        `<b>${escapeDetails(details.title)}</b>`,
        details.alternateTitle && details.alternateTitle !== details.title ? `<i>${escapeDetails(details.alternateTitle)}</i>` : null,
        `Source: ${details.providerLabel}`,
        details.status ? `Status: ${escapeDetails(details.status)}` : null,
        details.releaseYear ? `Year: ${details.releaseYear}` : null,
        details.totalEpisodes ? `Episodes: ${details.totalEpisodes}` : null,
        details.totalVolumes ? `Volumes: ${details.totalVolumes}` : null,
        details.totalChapters ? `Chapters: ${details.totalChapters}` : null,
        details.authors?.length ? `Authors: ${escapeDetails(details.authors.join(', '))}` : null,
        details.genres?.length ? `Genres: ${escapeDetails(details.genres.slice(0, 6).join(', '))}` : null,
        details.streamingUrl ? `Streaming: ${escapeDetails(details.streamingUrl)}` : null,
        details.detailsUrl ? `Details: ${escapeDetails(details.detailsUrl)}` : null,
    ]

    if (details.description) {
        lines.push('', escapeDetails(stripHtml(details.description)).slice(0, 900))
    }

    return lines.filter((line): line is string => Boolean(line)).join('\n')
}

function dedupeDetails(details: MediaDetails[]) {
    const seen = new Set<string>()
    const deduped: MediaDetails[] = []

    for (const item of details) {
        const key = `${item.provider}:${item.id}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(item)
    }

    return deduped
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function stripHtml(value: string) {
    return value.replace(/<[^>]*>/g, '')
}

function escapeDetails(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
