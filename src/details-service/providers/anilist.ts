import axios from 'axios'
import { ANILIST_URL } from '../../anilist-service/index.js'
import type { DetailIdInput, DetailSearchInput, MediaDetails, MediaDetailsProvider } from '../types.js'

type AniListTitle = {
    romaji?: string | null
    english?: string | null
    native?: string | null
}

type AniListMedia = {
    id: number
    title?: AniListTitle | null
    description?: string | null
    siteUrl?: string | null
    seasonYear?: number | null
    episodes?: number | null
    chapters?: number | null
    volumes?: number | null
    status?: string | null
    genres?: string[] | null
    averageScore?: number | null
    source?: string | null
    coverImage?: {
        extraLarge?: string | null
        large?: string | null
        medium?: string | null
    } | null
    streamingEpisodes?: {
        site?: string | null
        title?: string | null
        url?: string | null
    }[] | null
    externalLinks?: {
        site?: string | null
        url?: string | null
        type?: string | null
    }[] | null
    staff?: {
        edges?: {
            role?: string | null
            node?: {
                name?: {
                    full?: string | null
                } | null
            } | null
        }[] | null
    } | null
}

type AniListPageResponse = {
    Page?: {
        media?: AniListMedia[] | null
    } | null
}

type AniListMediaResponse = {
    Media?: AniListMedia | null
}

async function queryAniList<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
    const result = await axios.post(ANILIST_URL, {
        query,
        variables,
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        timeout: 5000,
        signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    return result?.data?.data ?? null
}

const mediaFields = `
    id
    title {
        romaji
        english
        native
    }
    description(asHtml: false)
    siteUrl
    seasonYear
    episodes
    chapters
    volumes
    status
    genres
    averageScore
    source
    coverImage {
        extraLarge
        large
        medium
    }
    streamingEpisodes {
        site
        title
        url
    }
    externalLinks {
        site
        url
        type
    }
    staff(sort: [RELEVANCE, ID], perPage: 8) {
        edges {
            role
            node {
                name {
                    full
                }
            }
        }
    }
`

function titleFor(media: AniListMedia): string {
    return media.title?.english || media.title?.romaji || media.title?.native || `AniList ${media.id}`
}

function streamingUrlFor(media: AniListMedia): string | undefined {
    const crunchyroll = media.streamingEpisodes?.find(link => /crunchyroll/i.test(link.site ?? '') && link.url)
    const legalEpisode = media.streamingEpisodes?.find(link => link.url)
    const crunchyrollExternal = media.externalLinks?.find(link => /crunchyroll/i.test(link.site ?? '') && link.url)
    const streamingExternal = media.externalLinks?.find(link => link.type === 'STREAMING' && link.url)

    return crunchyroll?.url ?? crunchyrollExternal?.url ?? legalEpisode?.url ?? streamingExternal?.url ?? undefined
}

function authorsFor(media: AniListMedia): string[] | undefined {
    const authors = media.staff?.edges
        ?.filter(edge => /story|original|novel|author|creator/i.test(edge.role ?? ''))
        .map(edge => edge.node?.name?.full)
        .filter((name): name is string => Boolean(name))

    return authors && authors.length > 0 ? [...new Set(authors)].slice(0, 4) : undefined
}

function mapMedia(media: AniListMedia, kind: 'anime' | 'reading'): MediaDetails {
    return {
        kind,
        provider: 'anilist',
        providerLabel: 'AniList',
        id: String(media.id),
        anilistId: media.id,
        title: titleFor(media),
        alternateTitle: media.title?.romaji ?? undefined,
        nativeTitle: media.title?.native ?? undefined,
        description: media.description ?? undefined,
        status: media.status ?? undefined,
        genres: media.genres ?? undefined,
        releaseYear: media.seasonYear ?? undefined,
        totalEpisodes: media.episodes ?? undefined,
        totalVolumes: media.volumes ?? undefined,
        totalChapters: media.chapters ?? undefined,
        authors: authorsFor(media),
        source: media.source ?? undefined,
        averageScore: media.averageScore ?? undefined,
        coverImageUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? media.coverImage?.medium ?? undefined,
        detailsUrl: media.siteUrl ?? undefined,
        streamingUrl: kind === 'anime' ? streamingUrlFor(media) : undefined,
    }
}

function mediaSelector(kind: 'anime' | 'reading') {
    return kind === 'anime' ? 'type: ANIME' : 'format: NOVEL'
}

export const anilistProvider: MediaDetailsProvider = {
    id: 'anilist',
    label: 'AniList',
    supportedKinds: ['anime', 'reading'],
    async search(input: DetailSearchInput) {
        const query = `
            query ($search: String, $perPage: Int) {
                Page(page: 1, perPage: $perPage) {
                    media(search: $search, ${mediaSelector(input.kind)}, sort: FAVOURITES_DESC) {
                        ${mediaFields}
                    }
                }
            }
        `

        const data = await queryAniList<AniListPageResponse>(query, {
            search: input.query,
            perPage: input.limit ?? 5,
        })

        return data?.Page?.media?.map(media => mapMedia(media, input.kind)) ?? []
    },
    async getById(input: DetailIdInput) {
        const id = Number(input.id)
        if (!Number.isInteger(id)) return null

        const query = `
            query ($id: Int) {
                Media(id: $id, ${mediaSelector(input.kind)}) {
                    ${mediaFields}
                }
            }
        `

        const data = await queryAniList<AniListMediaResponse>(query, { id })
        return data?.Media ? mapMedia(data.Media, input.kind) : null
    },
}
