import axios from 'axios'
import type { DetailIdInput, DetailSearchInput, MediaDetails, MediaDetailsProvider } from '../types.js'

const OPEN_LIBRARY_URL = 'https://openlibrary.org'

type OpenLibraryDoc = {
    key?: string
    title?: string
    author_name?: string[]
    first_publish_year?: number
    subject?: string[]
    cover_i?: number
}

type OpenLibrarySearchResponse = {
    docs?: OpenLibraryDoc[]
}

type OpenLibraryWork = {
    key?: string
    title?: string
    description?: string | { value?: string }
    subjects?: string[]
    covers?: number[]
}

function coverUrl(coverId?: number) {
    return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined
}

function mapDoc(doc: OpenLibraryDoc): MediaDetails {
    const id = (doc.key ?? '').replace(/^\/works\//, '')

    return {
        kind: 'reading',
        provider: 'open-library',
        providerLabel: 'Open Library',
        id,
        title: doc.title || `Open Library ${id}`,
        authors: doc.author_name?.slice(0, 5),
        releaseYear: doc.first_publish_year,
        genres: doc.subject?.slice(0, 8),
        coverImageUrl: coverUrl(doc.cover_i),
        detailsUrl: doc.key ? `${OPEN_LIBRARY_URL}${doc.key}` : undefined,
    }
}

function mapWork(work: OpenLibraryWork, id: string): MediaDetails {
    const description = typeof work.description === 'string' ? work.description : work.description?.value

    return {
        kind: 'reading',
        provider: 'open-library',
        providerLabel: 'Open Library',
        id,
        title: work.title || `Open Library ${id}`,
        description,
        genres: work.subjects?.slice(0, 8),
        coverImageUrl: coverUrl(work.covers?.[0]),
        detailsUrl: `${OPEN_LIBRARY_URL}/works/${id}`,
    }
}

async function request<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
    const result = await axios.get(`${OPEN_LIBRARY_URL}${path}`, {
        params,
        timeout: 5000,
        signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    return result?.data ?? null
}

export const openLibraryProvider: MediaDetailsProvider = {
    id: 'open-library',
    label: 'Open Library',
    supportedKinds: ['reading'],
    async search(input: DetailSearchInput) {
        if (input.kind !== 'reading') return []

        const data = await request<OpenLibrarySearchResponse>('/search.json', {
            q: input.query,
            limit: input.limit ?? 5,
        })

        return data?.docs?.map(mapDoc).filter(details => details.id.length > 0) ?? []
    },
    async getById(input: DetailIdInput) {
        if (input.kind !== 'reading') return null

        const id = input.id.replace(/^\/?works\//, '')
        const data = await request<OpenLibraryWork>(`/works/${encodeURIComponent(id)}.json`)
        return data ? mapWork(data, id) : null
    },
}
