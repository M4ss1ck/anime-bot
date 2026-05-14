import { afterEach, describe, expect, test } from 'bun:test'
import axios from 'axios'
import { hardcoverProvider } from '../src/details-service/providers/hardcover.ts'

const originalPost = axios.post
const originalToken = process.env.HARDCOVER_API_TOKEN

afterEach(() => {
    axios.post = originalPost
    process.env.HARDCOVER_API_TOKEN = originalToken
})

describe('hardcoverProvider', () => {
    test('searches book series by exact series name and maps nested books', async () => {
        process.env.HARDCOVER_API_TOKEN = 'test-token'

        let postedBody: { query: string, variables: Record<string, unknown> } | undefined
        axios.post = ((url: string, body: typeof postedBody) => {
            postedBody = body

            return Promise.resolve({
                data: {
                    data: {
                        book_series: [{
                            book: {
                                id: 123,
                                title: 'Dungeon Crawler Carl',
                                description: 'A book about surviving a dungeon.',
                                release_date: '2020-09-01',
                                image: { url: 'https://img.example/book.jpg' },
                                contributions: [{
                                    author: { name: 'Matt Dinniman' },
                                }],
                            },
                        }],
                    },
                },
            })
        }) as typeof axios.post

        const results = await hardcoverProvider.search({
            kind: 'reading',
            query: 'Dungeon Crawler Carl',
            limit: 10,
        })

        expect(postedBody?.query).toContain('book_series')
        expect(postedBody?.query).toContain('series: {name: {_eq: $query}}')
        expect(postedBody?.query).not.toContain('_ilike')
        expect(postedBody?.variables).toEqual({
            query: 'Dungeon Crawler Carl',
            limit: 10,
        })
        expect(results).toEqual([{
            kind: 'reading',
            provider: 'hardcover',
            providerLabel: 'Hardcover',
            id: '123',
            title: 'Dungeon Crawler Carl',
            description: 'A book about surviving a dungeon.',
            releaseYear: 2020,
            authors: ['Matt Dinniman'],
            coverImageUrl: 'https://img.example/book.jpg',
            detailsUrl: 'https://hardcover.app/books/123',
        }])
    })
})
