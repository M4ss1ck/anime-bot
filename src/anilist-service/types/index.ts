export type Anime = {
    id: number
    title: {
        romaji: string
        english: string
        native: string
    }
    type: string
    genres: string[]
}

export type AnimeFull = {
    description: string
    seasonYear: number
    episodes: number
    hashtag: string
    nextAiringEpisode: {
        airingAt: number
        episode: number
    }
    coverImage: {
        extraLarge: string
        large: string
        medium: string
        color: string
    }
    status: string
    relations?: {
        edges: {
            relationType: string
            node: AnimeFull
        }[]
    }
} & Anime

export type NovelFull = {
    description: string
    coverImage: {
        large: string
        medium: string
    }
    bannerImage: string
    status: string
    averageScore: number
    chapters: number
    volumes: number
    format: string
    source: string
} & Anime

export type Character = {
    id: number
    name: {
        first: string
        middle: string
        last: string
        full: string
        native: string
        userPreferred: string
    }
    image: {
        large: string
        medium: string
    }
    description: string
    dateOfBirth: {
        year: number
        month: number
        day: number
    }
    age: string
    gender: string
    bloodType: string
    siteUrl: string
}

export type PageInfo = {
    total: number
    perPage: number
}

export type AnimePage = {
    Page: {
        pageInfo: PageInfo
        media: Anime[]
    }
}

export type NovelPage = {
    Page: {
        pageInfo: PageInfo
        media: Anime[]
    }
}

export type SpecificAnime = {
    Media: AnimeFull
}

export type SpecificNovel = {
    Media: NovelFull
}

export type CharacterPage = {
    Page: {
        pageInfo: PageInfo
        characters: Character[]
    }
}

export type SpecificCharacter = {
    Character: Character
}