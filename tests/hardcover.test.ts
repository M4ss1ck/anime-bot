import { afterEach, describe, expect, test } from 'bun:test'
import axios from 'axios'
import { hardcoverProvider } from '../src/details-service/providers/hardcover.ts'

const originalPost = axios.post
const originalToken = process.env.HARDCOVER_API_TOKEN

function mockPost(response: unknown) {
    const calls: { query: string, variables: Record<string, unknown> }[] = []

    axios.post = ((url: string, body: { query: string, variables: Record<string, unknown> }) => {
        calls.push(body)
        return Promise.resolve({ data: response })
    }) as typeof axios.post

    return calls
}

afterEach(() => {
    axios.post = originalPost
    process.env.HARDCOVER_API_TOKEN = originalToken
})

describe('hardcoverProvider.search', () => {
    test('searches series through the search endpoint and maps hits', async () => {
        process.env.HARDCOVER_API_TOKEN = 'test-token'

        const calls = mockPost({
            data: {
                search: {
                    error: null,
                    results: {
                        hits: [{
                            document: {
                                id: '12717',
                                name: 'Dungeon Crawler Carl',
                                slug: 'dungeon-crawler-carl',
                                author_name: 'Matt Dinniman',
                                books_count: 11,
                                primary_books_count: 8,
                            },
                        }],
                    },
                },
            },
        })

        const results = await hardcoverProvider.search({
            kind: 'reading',
            query: 'dungeon crawler carl',
            limit: 10,
        })

        expect(calls[0]?.query).toContain('search(')
        expect(calls[0]?.variables).toEqual({
            query: 'dungeon crawler carl',
            queryType: 'Series',
            perPage: 10,
        })
        expect(results).toEqual([{
            kind: 'reading',
            provider: 'hardcover',
            providerLabel: 'Hardcover',
            id: '12717',
            title: 'Dungeon Crawler Carl',
            authors: ['Matt Dinniman'],
            totalVolumes: 8,
            detailsUrl: 'https://hardcover.app/series/dungeon-crawler-carl',
        }])
    })

    test('never sends _eq or _ilike, which this server rejects or matches too strictly', async () => {
        process.env.HARDCOVER_API_TOKEN = 'test-token'
        const calls = mockPost({ data: { search: { results: { hits: [] } } } })

        await hardcoverProvider.search({ kind: 'reading', query: 'mistborn' })

        expect(calls[0]?.query).not.toContain('_ilike')
        expect(calls[0]?.query).not.toContain('_eq')
    })

    test('returns nothing when the api reports an error', async () => {
        process.env.HARDCOVER_API_TOKEN = 'test-token'
        mockPost({ errors: [{ message: 'field "search" not found' }] })

        expect(await hardcoverProvider.search({ kind: 'reading', query: 'mistborn' })).toEqual([])
    })

    test('returns nothing without a token', async () => {
        delete process.env.HARDCOVER_API_TOKEN

        expect(await hardcoverProvider.search({ kind: 'reading', query: 'mistborn' })).toEqual([])
    })
})

describe('hardcoverProvider.getById', () => {
    test('resolves a series id, not a book id', async () => {
        process.env.HARDCOVER_API_TOKEN = 'test-token'

        const calls = mockPost({
            data: {
                series_by_pk: {
                    id: 12717,
                    name: 'Dungeon Crawler Carl',
                    slug: 'dungeon-crawler-carl',
                    description: 'Carl and Princess Donut crawl a deadly dungeon.',
                    books_count: 8,
                    primary_books_count: 8,
                    is_completed: false,
                    author: { name: 'Matt Dinniman' },
                    book_series: [{
                        position: 1,
                        book: {
                            id: 446681,
                            title: 'Dungeon Crawler Carl',
                            release_date: '2020-09-21',
                            image: { url: 'https://assets.hardcover.app/cover.jpeg' },
                            contributions: [{ author: { name: 'Matt Dinniman' } }],
                        },
                    }],
                },
            },
        })

        const details = await hardcoverProvider.getById({ kind: 'reading', id: '12717' })

        expect(calls[0]?.query).toContain('series_by_pk')
        expect(calls[0]?.variables).toEqual({ id: 12717 })
        expect(details).toEqual({
            kind: 'reading',
            provider: 'hardcover',
            providerLabel: 'Hardcover',
            id: '12717',
            title: 'Dungeon Crawler Carl',
            description: 'Carl and Princess Donut crawl a deadly dungeon.',
            releaseYear: 2020,
            authors: ['Matt Dinniman'],
            totalVolumes: 8,
            status: 'Releasing',
            coverImageUrl: 'https://assets.hardcover.app/cover.jpeg',
            detailsUrl: 'https://hardcover.app/series/dungeon-crawler-carl',
        })
    })

    test('rejects non numeric ids', async () => {
        process.env.HARDCOVER_API_TOKEN = 'test-token'
        mockPost({ data: { series_by_pk: null } })

        expect(await hardcoverProvider.getById({ kind: 'reading', id: 'abc' })).toBeNull()
    })
})
