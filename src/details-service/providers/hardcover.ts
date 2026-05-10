import axios from 'axios'
import type { DetailIdInput, DetailSearchInput, MediaDetails, MediaDetailsProvider } from '../types.js'

const HARDCOVER_URL = 'https://api.hardcover.app/v1/graphql'

type HardcoverBook = {
    id: number
    title?: string | null
    description?: string | null
    release_date?: string | null
    image?: {
        url?: string | null
    } | null
    contributions?: {
        author?: {
            name?: string | null
        } | null
    }[] | null
}

type HardcoverResponse = {
    data?: {
        books?: HardcoverBook[]
        books_by_pk?: HardcoverBook | null
    }
}

function token() {
    return process.env.HARDCOVER_API_TOKEN?.trim()
}

function isEnabled() {
    return Boolean(token())
}

function mapBook(book: HardcoverBook): MediaDetails {
    const year = book.release_date?.match(/\d{4}/)?.[0]
    const authors = book.contributions
        ?.map(contribution => contribution.author?.name)
        .filter((name): name is string => Boolean(name))

    return {
        kind: 'reading',
        provider: 'hardcover',
        providerLabel: 'Hardcover',
        id: String(book.id),
        title: book.title || `Hardcover ${book.id}`,
        description: book.description ?? undefined,
        releaseYear: year ? Number(year) : undefined,
        authors: authors && authors.length > 0 ? [...new Set(authors)] : undefined,
        coverImageUrl: book.image?.url ?? undefined,
        detailsUrl: `https://hardcover.app/books/${book.id}`,
    }
}

async function queryHardcover<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
    const apiToken = token()
    if (!apiToken) return null

    const result = await axios.post(HARDCOVER_URL, {
        query,
        variables,
    }, {
        headers: {
            Authorization: apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
        timeout: 5000,
        signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    return result?.data ?? null
}

export const hardcoverProvider: MediaDetailsProvider = {
    id: 'hardcover',
    label: 'Hardcover',
    supportedKinds: ['reading'],
    async search(input: DetailSearchInput) {
        if (input.kind !== 'reading' || !isEnabled()) return []

        const query = `
            query SearchBooks($query: String!, $limit: Int!) {
                books(where: {title: {_ilike: $query}}, limit: $limit) {
                    id
                    title
                    description
                    release_date
                    image {
                        url
                    }
                    contributions {
                        author {
                            name
                        }
                    }
                }
            }
        `

        const data = await queryHardcover<HardcoverResponse>(query, {
            query: `%${input.query}%`,
            limit: input.limit ?? 5,
        })

        return data?.data?.books?.map(mapBook) ?? []
    },
    async getById(input: DetailIdInput) {
        if (input.kind !== 'reading' || !isEnabled()) return null

        const id = Number(input.id)
        if (!Number.isInteger(id)) return null

        const query = `
            query BookById($id: Int!) {
                books_by_pk(id: $id) {
                    id
                    title
                    description
                    release_date
                    image {
                        url
                    }
                    contributions {
                        author {
                            name
                        }
                    }
                }
            }
        `

        const data = await queryHardcover<HardcoverResponse>(query, { id })
        return data?.data?.books_by_pk ? mapBook(data.data.books_by_pk) : null
    },
}
