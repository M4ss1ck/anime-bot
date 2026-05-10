import axios from 'axios'
import type { DetailIdInput, DetailSearchInput, MediaDetails, MediaDetailsProvider } from '../types.js'

const KITSU_URL = 'https://kitsu.io/api/edge'

type KitsuAnime = {
    id: string
    attributes?: {
        canonicalTitle?: string | null
        titles?: Record<string, string | null> | null
        synopsis?: string | null
        status?: string | null
        episodeCount?: number | null
        startDate?: string | null
        posterImage?: {
            original?: string | null
            large?: string | null
            medium?: string | null
        } | null
        averageRating?: string | null
    } | null
}

type KitsuResponse = {
    data?: KitsuAnime[] | KitsuAnime | null
}

function mapAnime(item: KitsuAnime): MediaDetails {
    const attributes = item.attributes ?? {}
    const titles = attributes.titles ?? {}

    return {
        kind: 'anime',
        provider: 'kitsu',
        providerLabel: 'Kitsu',
        id: item.id,
        title: attributes.canonicalTitle || titles.en || titles.en_jp || `Kitsu ${item.id}`,
        alternateTitle: titles.en_jp ?? undefined,
        nativeTitle: titles.ja_jp ?? undefined,
        description: attributes.synopsis ?? undefined,
        status: attributes.status ?? undefined,
        totalEpisodes: attributes.episodeCount ?? undefined,
        releaseYear: attributes.startDate ? Number(attributes.startDate.slice(0, 4)) || undefined : undefined,
        averageScore: attributes.averageRating ? Number(attributes.averageRating) || undefined : undefined,
        coverImageUrl: attributes.posterImage?.original ?? attributes.posterImage?.large ?? attributes.posterImage?.medium ?? undefined,
        detailsUrl: `https://kitsu.app/anime/${item.id}`,
    }
}

async function request<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
    const result = await axios.get(`${KITSU_URL}${path}`, {
        params,
        headers: {
            Accept: 'application/vnd.api+json',
        },
        timeout: 5000,
        signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    return result?.data ?? null
}

export const kitsuProvider: MediaDetailsProvider = {
    id: 'kitsu',
    label: 'Kitsu',
    supportedKinds: ['anime'],
    async search(input: DetailSearchInput) {
        if (input.kind !== 'anime') return []

        const data = await request<KitsuResponse>('/anime', {
            'filter[text]': input.query,
            'page[limit]': input.limit ?? 5,
        })

        const items = Array.isArray(data?.data) ? data.data : []
        return items.map(mapAnime)
    },
    async getById(input: DetailIdInput) {
        if (input.kind !== 'anime') return null

        const data = await request<KitsuResponse>(`/anime/${encodeURIComponent(input.id)}`)
        return data?.data && !Array.isArray(data.data) ? mapAnime(data.data) : null
    },
}
