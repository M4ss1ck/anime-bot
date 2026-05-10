export type DetailKind = 'anime' | 'reading'

export type DetailProviderId = 'anilist' | 'kitsu' | 'google-books' | 'open-library' | 'hardcover'

export type MediaDetails = {
    kind: DetailKind
    provider: DetailProviderId
    providerLabel: string
    id: string
    title: string
    alternateTitle?: string
    nativeTitle?: string
    description?: string
    status?: string
    genres?: string[]
    releaseYear?: number
    totalEpisodes?: number
    totalVolumes?: number
    totalChapters?: number
    authors?: string[]
    source?: string
    averageScore?: number
    coverImageUrl?: string
    detailsUrl?: string
    streamingUrl?: string
    anilistId?: number
}

export type DetailSearchInput = {
    kind: DetailKind
    query: string
    limit?: number
}

export type DetailIdInput = {
    kind: DetailKind
    id: string
}

export type MediaDetailsProvider = {
    id: DetailProviderId
    label: string
    supportedKinds: DetailKind[]
    search(input: DetailSearchInput): Promise<MediaDetails[]>
    getById(input: DetailIdInput): Promise<MediaDetails | null>
}

export type SavedMediaRecord = {
    name: string
    anilistId?: number | null
}

export type DetailUpdateInput = {
    kind: DetailKind
    details: MediaDetails
}

export type AnimeDetailUpdate = {
    anilistId?: number
    detailsProvider: string
    detailsId: string
    detailsUrl?: string
    coverImageUrl?: string
    status?: string
    genres?: string
    description?: string
    totalEpisodes?: number
    streamingUrl?: string
}

export type ReadingDetailUpdate = {
    anilistId?: number
    detailsProvider: string
    detailsId: string
    detailsUrl?: string
    coverImageUrl?: string
    status?: string
    genres?: string
    description?: string
    totalVolumes?: number
    totalChapters?: number
    authors?: string
    source?: string
}

export function supportsKind(provider: MediaDetailsProvider, kind: DetailKind) {
    return provider.supportedKinds.includes(kind)
}
