import axios from 'axios'
import { logger } from '../../logger/index.js'
import type { DetailIdInput, DetailSearchInput, MediaDetails, MediaDetailsProvider } from '../types.js'

const HARDCOVER_URL = 'https://api.hardcover.app/v1/graphql'

type HardcoverBook = {
    id: number
    title?: string | null
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

type HardcoverSeries = {
    id: number
    name?: string | null
    slug?: string | null
    description?: string | null
    books_count?: number | null
    primary_books_count?: number | null
    is_completed?: boolean | null
    author?: {
        name?: string | null
    } | null
    book_series?: {
        position?: number | null
        book?: HardcoverBook | null
    }[] | null
}

type HardcoverSeriesDocument = {
    id?: string | number | null
    name?: string | null
    slug?: string | null
    author_name?: string | null
    books_count?: number | null
    primary_books_count?: number | null
}

type HardcoverResponse = {
    data?: {
        series_by_pk?: HardcoverSeries | null
        search?: {
            error?: string | null
            results?: {
                hits?: {
                    document?: HardcoverSeriesDocument | null
                }[] | null
            } | null
        } | null
    }
    errors?: { message?: string }[]
}

function token() {
    return process.env.HARDCOVER_API_TOKEN?.trim()
}

function isEnabled() {
    return Boolean(token())
}

function seriesUrl(slug?: string | null) {
    return slug ? `https://hardcover.app/series/${slug}` : undefined
}

function releasingStatus(isCompleted?: boolean | null) {
    if (isCompleted === true) return 'Completed'
    if (isCompleted === false) return 'Releasing'

    return undefined
}

function mapSeriesDocument(document: HardcoverSeriesDocument): MediaDetails | null {
    if (document.id === undefined || document.id === null) return null

    return {
        kind: 'reading',
        provider: 'hardcover',
        providerLabel: 'Hardcover',
        id: String(document.id),
        title: document.name || `Hardcover series ${document.id}`,
        authors: document.author_name ? [document.author_name] : undefined,
        totalVolumes: document.primary_books_count || document.books_count || undefined,
        detailsUrl: seriesUrl(document.slug),
    }
}

function mapSeries(series: HardcoverSeries): MediaDetails {
    const books = series.book_series
        ?.map(entry => entry.book)
        .filter((book): book is HardcoverBook => Boolean(book)) ?? []

    const year = books.find(book => book.release_date)?.release_date?.match(/\d{4}/)?.[0]
    const authors = series.author?.name
        ? [series.author.name]
        : books.flatMap(book => book.contributions?.map(contribution => contribution.author?.name) ?? [])
            .filter((name): name is string => Boolean(name))

    return {
        kind: 'reading',
        provider: 'hardcover',
        providerLabel: 'Hardcover',
        id: String(series.id),
        title: series.name || `Hardcover series ${series.id}`,
        description: series.description ?? undefined,
        releaseYear: year ? Number(year) : undefined,
        authors: authors.length > 0 ? [...new Set(authors)] : undefined,
        totalVolumes: series.primary_books_count || series.books_count || undefined,
        status: releasingStatus(series.is_completed),
        coverImageUrl: books.find(book => book.image?.url)?.image?.url ?? undefined,
        detailsUrl: seriesUrl(series.slug),
    }
}

async function queryHardcover(query: string, variables: Record<string, unknown>): Promise<HardcoverResponse['data'] | null> {
    const apiToken = token()
    if (!apiToken) return null

    const result = await axios.post<HardcoverResponse>(HARDCOVER_URL, {
        query,
        variables,
    }, {
        headers: {
            Authorization: apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
        timeout: 5000,
        signal: AbortSignal.timeout(5000),
    }).catch(error => {
        logger.error(`Hardcover request failed: ${error?.response?.status ?? ''} ${JSON.stringify(error?.response?.data ?? error?.message)}`)
        return null
    })

    const errors = result?.data?.errors
    if (errors?.length) {
        logger.error(`Hardcover returned errors: ${errors.map(entry => entry.message).join('; ')}`)
        return null
    }

    return result?.data?.data ?? null
}

export const hardcoverProvider: MediaDetailsProvider = {
    id: 'hardcover',
    label: 'Hardcover',
    supportedKinds: ['reading'],
    async search(input: DetailSearchInput) {
        if (input.kind !== 'reading' || !isEnabled()) return []

        const seriesName = input.query.trim()
        if (!seriesName) return []

        const query = `
            query SearchSeries($query: String!, $queryType: String!, $perPage: Int!) {
                search(query: $query, query_type: $queryType, per_page: $perPage, page: 1) {
                    error
                    results
                }
            }
        `

        const data = await queryHardcover(query, {
            query: seriesName,
            queryType: 'Series',
            perPage: input.limit ?? 5,
        })

        if (data?.search?.error) {
            logger.error(`Hardcover search error: ${data.search.error}`)
            return []
        }

        return data?.search?.results?.hits
            ?.map(hit => hit.document)
            .filter((document): document is HardcoverSeriesDocument => Boolean(document))
            .map(mapSeriesDocument)
            .filter((details): details is MediaDetails => Boolean(details)) ?? []
    },
    async getById(input: DetailIdInput) {
        if (input.kind !== 'reading' || !isEnabled()) return null

        const id = Number(input.id)
        if (!Number.isInteger(id)) return null

        const query = `
            query SeriesById($id: Int!) {
                series_by_pk(id: $id) {
                    id
                    name
                    slug
                    description
                    books_count
                    primary_books_count
                    is_completed
                    author {
                        name
                    }
                    book_series(order_by: {position: asc}) {
                        position
                        book {
                            id
                            title
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
                }
            }
        `

        const data = await queryHardcover(query, { id })
        return data?.series_by_pk ? mapSeries(data.series_by_pk) : null
    },
}
