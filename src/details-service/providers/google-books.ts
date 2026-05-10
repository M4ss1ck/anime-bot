import axios from 'axios'
import type { DetailIdInput, DetailSearchInput, MediaDetails, MediaDetailsProvider } from '../types.js'

const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1'

type GoogleBook = {
    id: string
    volumeInfo?: {
        title?: string | null
        subtitle?: string | null
        authors?: string[] | null
        description?: string | null
        publishedDate?: string | null
        categories?: string[] | null
        pageCount?: number | null
        imageLinks?: {
            thumbnail?: string | null
            smallThumbnail?: string | null
        } | null
        infoLink?: string | null
        previewLink?: string | null
    } | null
}

type GoogleBooksResponse = {
    items?: GoogleBook[] | null
}

function imageUrl(book: GoogleBook) {
    return book.volumeInfo?.imageLinks?.thumbnail?.replace(/^http:/, 'https:') ??
        book.volumeInfo?.imageLinks?.smallThumbnail?.replace(/^http:/, 'https:') ??
        undefined
}

function releaseYear(book: GoogleBook) {
    const year = book.volumeInfo?.publishedDate?.match(/\d{4}/)?.[0]
    return year ? Number(year) : undefined
}

function mapBook(book: GoogleBook): MediaDetails {
    const info = book.volumeInfo ?? {}

    return {
        kind: 'reading',
        provider: 'google-books',
        providerLabel: 'Google Books',
        id: book.id,
        title: info.title || `Google Books ${book.id}`,
        alternateTitle: info.subtitle ?? undefined,
        description: info.description ?? undefined,
        authors: info.authors ?? undefined,
        genres: info.categories ?? undefined,
        releaseYear: releaseYear(book),
        coverImageUrl: imageUrl(book),
        detailsUrl: info.infoLink ?? info.previewLink ?? undefined,
    }
}

async function request<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
    const result = await axios.get(`${GOOGLE_BOOKS_URL}${path}`, {
        params,
        timeout: 5000,
        signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    return result?.data ?? null
}

export const googleBooksProvider: MediaDetailsProvider = {
    id: 'google-books',
    label: 'Google Books',
    supportedKinds: ['reading'],
    async search(input: DetailSearchInput) {
        if (input.kind !== 'reading') return []

        const data = await request<GoogleBooksResponse>('/volumes', {
            q: input.query,
            maxResults: input.limit ?? 5,
        })

        return data?.items?.map(mapBook) ?? []
    },
    async getById(input: DetailIdInput) {
        if (input.kind !== 'reading') return null

        const data = await request<GoogleBook>(`/volumes/${encodeURIComponent(input.id)}`)
        return data ? mapBook(data) : null
    },
}
